/**
 * ⑤ タスクと持ち帰り — タスクタブの絞り込み帯（v4・一覧フォーマット統一 PR②・delta 21）
 *
 * ── 検索欄と並び順を足した ───────────────────────────────────
 *
 * 旧実装はチップだけで、検索も並べ替えも無かった（46件から目的の1件を
 * 探せない状態だった・モックの delta 21）。**検索・並び替えはどちらもすでに
 * 手元にある配列を画面で処理するだけ**（`GET /gpm/tasks` は絞り込み用の
 * クエリパラメータを持たない・全件を1回で取る設計 — `queries.ts` の
 * `useGpmTasks` と同じ理由）。サーバーには触れていない。
 *
 * ── ② プロジェクト一覧の `FilterBar.tsx` と部品を共有しない理由 ─────
 *
 * 持っている絞り込みの種類が違う（区分・用語ボタンが無く、検索欄と並び順の
 * 1段だけ）ため、専用の1段の帯にした。将来 ⑤ にも「用語」や区分に近い
 * 絞り込みが増えたら、②と合わせて `contexts/shared/components/` へ寄せる余地はある。
 */
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ymd, type GpmTask } from '../../types';
import { compareDue } from '../projectList/sort';

export type TaskSortKey = 'default' | 'due_asc';

const SORT_W = 'h-10 w-[150px] shrink-0'; // ui-tokens-ok: 並び順。2つの選択肢がどちらも1行で収まる幅

export const TASK_SORT_OPTIONS: { value: TaskSortKey; label: string }[] = [
  { value: 'default', label: '既定の順' },
  { value: 'due_asc', label: '期限が近い順' },
];

/**
 * `due_asc` を選んだときだけ並べ替える。**既定はサーバーが返した順のまま**
 * （`gpm.service.ts` の `listAll` が既に「未完了→期限が近い順→プロジェクト名」で
 * 返しているため、多くの場面で見た目は変わらない。並べ替えという新しい操作を
 * 追加したことによる見え方の変化を、既定値では起こさないための選択）。
 */
export function sortTasks(rows: GpmTask[], sort: TaskSortKey): GpmTask[] {
  if (sort !== 'due_asc') return rows;
  const withKey = rows.map((t, i) => ({ t, i }));
  withKey.sort((a, b) => compareDue(ymd(a.t.due_at), ymd(b.t.due_at), a.i - b.i));
  return withKey.map((x) => x.t);
}

export function FilterBar({
  search, onSearch, sort, onSort,
}: {
  search: string;
  onSearch: (v: string) => void;
  sort: TaskSortKey;
  onSort: (v: TaskSortKey) => void;
}) {
  return (
    <div className="flex h-10 items-stretch gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          placeholder="タスク名・プロジェクト名で探す"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="h-10 pl-9"
          aria-label="タスクを検索"
        />
      </div>
      <Select value={sort} onValueChange={(v) => onSort(v as TaskSortKey)}>
        <SelectTrigger className={SORT_W} aria-label="並び順"><SelectValue /></SelectTrigger>
        <SelectContent>
          {TASK_SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
