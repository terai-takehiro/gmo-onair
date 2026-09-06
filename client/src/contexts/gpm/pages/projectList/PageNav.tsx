/**
 * ② プロジェクト一覧の件数表示とページ送り（v4・GPM 一覧フォーマット統一 PR②・delta 3）
 *
 * ── 案件一覧の `PageNav.tsx` と考え方は同じ・中身は client 側で切る ──
 *
 * 案件一覧はサーバー（`GET /projects`）がページ単位で返すので、
 * `pagination` はサーバーの応答そのもの。GPM は `useGpmProjects()` が
 * **絞り込みチップの件数を出すために全件を1回で取る**設計（`queries.ts` の
 * 説明）なので、ページ送りも**取得済みの配列を画面で切る**形にしてある
 * （`GpmProjectListPage.tsx` の `pageRows`）。
 *
 * 表示・言い回しは案件一覧と完全に揃える——**1ページで収まるときも件数を出す**・
 * **絞り込み中は「全」と言わない**（レビューでの指摘 #61 / #65 と同じ理由）。
 *
 * 将来、GPM も件数が数百件規模になってサーバー側ページングへ移すときは、
 * この部品を案件一覧の `PageNav.tsx` と統合できる（`pagination` の形は
 * 同じ4フィールドに揃えてある）。いまは呼び出し側の作り（全件取得）が違うので
 * 部品としては複製にしてある。
 */
import { Button } from '@/components/ui/button';

/** 案件一覧 `projectList/types.ts` の `ProjectListResponse['pagination']` と同じ形 */
export interface GpmPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function PageNav({
  pagination, page, onPage, filtered,
}: {
  pagination: GpmPagination | undefined;
  page: number;
  onPage: (next: number) => void;
  /** いま絞り込みが効いているか。「全」と言ってよいかを決める（案件一覧と同じ規則） */
  filtered: boolean;
}) {
  if (!pagination) return null;
  const all = filtered ? '' : '全';
  const note = filtered ? '（絞り込み中）' : '';
  if (pagination.totalPages <= 1) {
    return (
      <p className="text-sub text-muted-foreground">
        {all}<span className="font-number">{pagination.total}</span>件を表示しています{note}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sub text-muted-foreground">
        {all}<span className="font-number">{pagination.total}</span>件{note}のうち{' '}
        <span className="font-number">{(pagination.page - 1) * pagination.limit + 1}</span>–
        <span className="font-number">{Math.min(pagination.page * pagination.limit, pagination.total)}</span>件
      </p>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>前へ</Button>
        <Button variant="outline" disabled={page >= pagination.totalPages} onClick={() => onPage(page + 1)}>次へ</Button>
      </div>
    </div>
  );
}
