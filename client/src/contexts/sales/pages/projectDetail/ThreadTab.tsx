/**
 * 案件詳細 / やり取りタブ (v4 ⑥-C)
 *
 * お客様とのやり取りを**時系列で1本**にします。いまの元は活動記録
 * (`activity_logs`) だけです。メールの取り込みは AI が活動記録に書くので、
 * ここに出れば同じ流れの中に並びます。
 *
 * **打合せの録音から議事録を起こす機能はまだありません。** ここに入る予定の
 * ものなので、押せる場所と「次のバージョンで入ります」を出しておきます
 * (何も書かないと「録音したのに残らない」と思われる)。
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Mic, Info, Phone, Mail, Users, Presentation, MoreHorizontal } from 'lucide-react';
import api from '@/lib/api';
import { Row, RowMain, RowTitle, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { Button } from '@/components/ui/button';
import { localDateStr } from '@/lib/format';
import type { ActivityLog } from './types';

/** 活動の種類。DB の `activity_type` と同じ集合 */
const KIND: Record<string, { label: string; icon: typeof Phone }> = {
  call: { label: '電話', icon: Phone },
  email: { label: 'メール', icon: Mail },
  meeting: { label: '打合せ', icon: Users },
  visit: { label: '訪問', icon: Users },
  proposal: { label: '提案', icon: Presentation },
  followup: { label: '追いかけ', icon: MoreHorizontal },
  other: { label: 'その他', icon: MoreHorizontal },
};

interface ThreadItem extends ActivityLog {
  activity_type: string;
  description: string | null;
  user_name?: string | null;
}

export function ThreadTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<{ data: ThreadItem[] }>({
    queryKey: ['project-activities', projectId],
    queryFn: async () =>
      (await api.get('/activity-logs', { params: { project_id: projectId, limit: 100 } })).data,
  });

  const items = data?.data ?? [];
  const today = localDateStr(new Date());

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled title="録音から議事録を起こす機能は、次のバージョンで入ります">
          <Mic className="mr-2 h-4 w-4 text-destructive" aria-hidden="true" />打合せを録音
        </Button>
        <Link
          to="/sales/activity-logs"
          className="text-sub min-h-tap inline-flex items-center text-primary hover:underline lg:min-h-[36px]"
        >
          営業活動の画面で記録する
        </Link>
      </div>

      {isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : items.length === 0 ? (
        <EmptyState
          title="やり取りの記録はまだありません"
          description="電話・打合せは営業活動の画面から記録できます。メールは AI が自動で取り込みます。"
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-card">
          {items.map((a) => {
            const k = KIND[a.activity_type] ?? KIND.other;
            const overdue = a.next_action && !a.next_action_done_at
              && !!a.next_action_date && a.next_action_date < today;
            return (
              <Row key={a.id} divider align="start" stackOnMobile>
                <RowMain>
                  <RowTitle>{a.subject}</RowTitle>
                  {a.description && (
                    <p className="text-sub mt-0.5 whitespace-pre-line text-muted-foreground">{a.description}</p>
                  )}
                  {a.next_action && (
                    <p className={`text-sub-sm mt-1 ${overdue ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>
                      次にやること: {a.next_action}
                      {a.next_action_date && `（${a.next_action_date}${overdue ? ' 過ぎています' : ''}）`}
                      {a.next_action_done_at && '（済み）'}
                    </p>
                  )}
                </RowMain>
                <TableBadge w={96} label={k.label} variant="outline" />
                <RowSlot w={96} align="right" className="text-sub font-number text-muted-foreground">
                  {a.activity_date}
                </RowSlot>
              </Row>
            );
          })}
        </div>
      )}

      <div className="flex items-start gap-2.5 rounded-note border border-primary-border bg-primary-surface-weak px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-note text-secondary-foreground">
          <strong className="font-bold">打合せの録音から議事録を起こす機能は、次のバージョンで入ります。</strong>
          録音した内容から決定事項と未確認事項を AI が抜き出して、ここに残す予定です。
        </p>
      </div>
    </div>
  );
}
