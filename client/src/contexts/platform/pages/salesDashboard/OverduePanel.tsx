/**
 * 「期限が過ぎたやること」(v4 ①)
 *
 * ── 受付から移したもの ──────────────────────────────────────
 *
 * v4 の受付（②）は**モックどおり引き合いだけ**にしました。それまで受付には
 * 期限超過の次回アクションも混ざっていて、「お客様を待たせているもの」を
 * 見る唯一の場所になっていました。**先にここを作ってから**受付から外しています
 * （消すだけだと、待たせている相手を見る場所が無くなる）。
 *
 * ── 「止まっている案件」との違い ────────────────────────────
 *
 * あちらは**誰も触っていない案件**（7日以上、案件もタスクも活動記録も動かない）。
 * こちらは**やると決めて期限を書いたのに過ぎたもの**で、相手が待っています。
 * 混ぜると「動いていないが期限は無い」ものと「相手を待たせている」ものが
 * 同じ重さに見えます。
 *
 * ── 数字は「日」で読む ──────────────────────────────────────
 *
 * 行の頭に**何日超過しているか**を置きます。名前から読み始めると、
 * どれから電話すべきかが分かりません。
 */
import { Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { Panel } from './Panel';

interface OverdueRow {
  activity_id: string;
  project_id: string;
  project_name: string | null;
  gls_number: string | null;
  customer_name: string | null;
  next_action: string | null;
  next_action_date: string | null;
  assigned_to_name: string | null;
  days_overdue: number | null;
}

/** 一度に出すのは5件。全部は「一覧で見る」から */
const SHOW = 5;

export function OverduePanel() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'overdue-actions'],
    queryFn: async () => (await api.get('/dashboard/overdue-actions')).data.data as OverdueRow[],
    staleTime: 30_000,
  });

  const rows = data ?? [];
  const shown = rows.slice(0, SHOW);

  return (
    <Panel
      title="期限が過ぎたやること"
      icon={<Clock className="h-4 w-4" aria-hidden="true" />}
      note={rows.length > SHOW ? `${rows.length}件のうち古い順に${SHOW}件` : '相手を待たせています'}
      to="/sales/tasks/list"
      toLabel="やること一覧で見る"
      linkAt="foot"
    >
      {isLoading ? (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      ) : shown.length === 0 ? (
        <EmptyState
          title="期限が過ぎたやることはありません"
          description="次回アクションの期限はすべて守れています。"
        />
      ) : (
        shown.map((r) => (
          <Row
            key={r.activity_id}
            divider
            interactive
            onClick={() => navigate(`/sales/projects/${r.project_id}/thread`)}
          >
            {/* 日数を行の頭に。**どれから電話するかで読む枚** */}
            <RowSlot w={56} align="center">
              <span className="flex flex-col items-center leading-none">
                <span className="font-number text-lg font-bold text-destructive">{r.days_overdue ?? 0}</span>
                <span className="text-sub-sm text-muted-foreground">日超過</span>
              </span>
            </RowSlot>
            <RowMain>
              <RowTitle>{r.next_action || '（やることが書かれていません）'}</RowTitle>
              <RowSub>
                {[r.project_name, r.customer_name, r.assigned_to_name ? `担当 ${r.assigned_to_name}` : null]
                  .filter(Boolean).join(' ・ ')}
              </RowSub>
            </RowMain>
          </Row>
        ))
      )}
    </Panel>
  );
}
