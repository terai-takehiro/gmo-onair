/**
 * 「動いている案件」(v4 ① の主役)
 *
 * ── なぜ「自分の案件」ではないのか ────────────────────────
 *
 * モックの見出しは**「動いている案件」／「動きがあった順。案件は全員で見ます」**です。
 * v4 は主担当（`assigned_to`）を持つが、**実務の割り当てはタスク単位**
 * (client/CLAUDE.md「v4 の設計判断」) なので、ここを「自分の案件」（主担当で絞る）
 * にすると実務の実態と食い違います。誰がやるかは**次のアクションの担当**として
 * 1行ごとに出します。
 *
 * ── 同じ数字を2度数えない ─────────────────────────────────
 *
 * 中身は**案件一覧と同じ `GET /projects`** を並べ替えただけです
 * (`sort_by=last_move`)。ダッシュボード専用の問い合わせを作ると、
 * 一覧と件数・金額が食い違ったときに原因が追えません。
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import api from '@/lib/api';
import { STAGE_BADGE_LABEL, STAGE_BADGE_TONE } from '@/contexts/sales/pages/projectList/stages';
import type { ProjectListResponse } from '@/contexts/sales/pages/projectList/types';
import { Panel } from './Panel';

/** 出す件数。**増やさないこと** — ダッシュボードは1画面で全部見えるのが役目 */
const ROWS = 6;

export function MovingPanel() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery<ProjectListResponse>({
    queryKey: ['projects', 'dashboard-moving'],
    queryFn: async () => (await api.get('/projects', {
      // **GLS-A（案件）だけ** (migration 179)。この画面は案件管理のダッシュボード
      params: {
        tab: 'active', gls_category: 'A',
        sort_by: 'last_move', sort_dir: 'desc', page: 1, limit: ROWS,
      },
    })).data,
  });
  const rows = data?.data ?? [];

  return (
    <Panel title="動いている案件" note="動きがあった順。案件は全員で見ます" to="/sales/projects" toLabel="一覧をひらく">
      {isLoading ? (
        <Delayed><SkeletonRows rows={ROWS} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          title="進行中の案件がありません"
          description="GLS を発番した案件がここに並びます。まずは案件をつくってください。"
        />
      ) : (
        <>
          <RowHeader className="hidden sm:flex">
            <RowMain>案件 ／ お客様</RowMain>
            <RowSlot w={96}>ステージ</RowSlot>
            <RowSlot w={160}>次のアクション</RowSlot>
            <RowSlot w={72} align="right">最後の動き</RowSlot>
          </RowHeader>
          {rows.map((p) => (
            <Row
              key={p.id}
              divider
              interactive
              stackOnMobile
              onClick={() => navigate(`/sales/projects/${p.id}`)}
            >
              <RowMain>
                <RowTitle>{p.name}</RowTitle>
                <RowSub>{p.customer_name ?? 'お客様 未設定'}</RowSub>
              </RowMain>
              <RowSlot w={96}>
                <TableBadge label={STAGE_BADGE_LABEL[p.stage]} className={STAGE_BADGE_TONE[p.stage]} />
              </RowSlot>
              {/* 次のアクション。**誰がやるかを頭に付ける** (v4 は案件担当者を持たない) */}
              <RowSlot w={160} placeholder="—">
                {p.next_task_title && (
                  <span className="text-sub truncate">
                    {p.next_task_assignee ? `${p.next_task_assignee}：` : ''}{p.next_task_title}
                  </span>
                )}
              </RowSlot>
              <RowSlot w={72} align="right" hideOnMobile placeholder="—">
                {formatRelativeTime(p.last_activity_at)}
              </RowSlot>
            </Row>
          ))}
        </>
      )}
    </Panel>
  );
}
