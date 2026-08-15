import type { ProjectListResponse } from './types';
import { Button } from '@/components/ui/button';

/**
 * 件数とページ送り。**PC の一覧とスマホのカードで同じものを出します**
 * （レビューでの指摘 #61）。
 *
 * 前の版はこの中身が PC の一覧の中に直接書いてあったので、
 * **スマホには前へ／次へが1つも無く、21 件目以降の案件を開けませんでした**。
 * 写して置くと、片方だけ直したときにまた同じことが起きます。
 *
 * **1ページで収まるときも件数を出します**（モック）。出さないと、
 * 絞り込んだ結果が「これで全部」なのか「続きがあるのに切れている」のか
 * 画面から読み取れません。
 */
export function PageNav({
  pagination, page, onPage, filtered,
}: {
  pagination: ProjectListResponse['pagination'] | undefined;
  page: number;
  onPage: (next: number) => void;
  /**
   * いま絞り込みが効いているか。**「全」と言ってよいかを決めます**
   * （レビューでの指摘 #65）。
   *
   * ⚠️ 既定の期間（いま属する半期）は**絞り込みです**。実データ 46 件のところ
   * この窓に入るのは 4 件で、前の版は**「全4件を表示しています」**と出していました。
   * 「全」は**それしか無い**という言い切りなので、**42 件が隠れていることに
   * 誰も気づけません**（期間は上の枠に出ていますが、それを絞り込みとして
   * 読むかどうかは人によります）。
   *
   * **数えていない総数を作らない** — 「46 件のうち」と書くには絞り込み無しで
   * もう一度数える必要があり、それは押していない問い合わせです。
   * ここでは**「全」を外して、絞り込み中だと書く**にとどめます。
   */
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
