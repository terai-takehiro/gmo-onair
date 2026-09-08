/**
 * 案件台帳の絞り込みの帯（検索・ステージ・分類・計上会社・出す列・CSV）
 *
 * `ProjectLedgerPage` から切り出した（1ファイル 400 行の決めごと）。**状態は持たない** —
 * 絞り込みの値と決め方は `useLedgerState` / `filters.ts` にあり、ここは並べて押すだけ。
 *
 * 計上会社（`entity_code`・SCS / GSS / GMO）は案件の持ち物（`projects.entity_code`・
 * 2026年10月の事業再編。サーバーが規則で導き、人が変えるのは管理者だけの改番経由）。
 * **サーバーの `GET /projects?entity_code=` で絞る** — 画面で絞るとそのページの 100 件の
 * 中だけになり、全体で何件かが分からない（整合性チェックと同じ理由）。
 * 呼び名は表の「計上会社」列（`LedgerCells.tsx`）と同じ `ENTITY_BADGE_LABEL`。
 */
import { Columns3, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BUSINESS_ENTITIES } from '@gmo-onair/shared/src/keepReport/entity';
import { ProjectStageLabels, type ProjectStage } from '@/types';
import { ENTITY_BADGE_LABEL } from '../projectList/stages';
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
      {/* 計上会社。並びは `legal_entities.sort_order` と同じ（shared の `BUSINESS_ENTITIES`）・呼び名は表の列と同じ */}
      <Select value={s.filters.entityCode || 'all'} onValueChange={(v) => s.setFilter('entityCode', v === 'all' ? '' : v)}>
        <SelectTrigger className="h-10 w-[200px]" aria-label="計上会社で絞り込む"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">計上会社：すべて</SelectItem>
          {BUSINESS_ENTITIES.map((e) => (
            <SelectItem key={e} value={e}>{ENTITY_BADGE_LABEL[e]}（{e}）</SelectItem>
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
