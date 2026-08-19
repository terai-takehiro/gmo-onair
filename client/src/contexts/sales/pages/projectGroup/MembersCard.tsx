/**
 * 按分グループの所属案件 (v4)
 */
import { Row, RowMain, RowTitle, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import type { GroupMember } from './types';

export function MembersCard({ members }: { members: GroupMember[] }) {
  return (
    <div>
      <h2 className="text-cardtitle mb-2 font-bold">所属案件</h2>
      {members.length === 0 ? (
        <EmptyState title="案件が登録されていません" description="グループを編集して案件を追加してください。" />
      ) : (
        <div className="rounded-card overflow-hidden border border-border">
          {members.map((m, i) => (
            <Row key={m.id} divider={i < members.length - 1}>
              <RowMain>
                <RowTitle>
                  <span className="font-number mr-1.5 text-primary">{m.gls_number}</span>
                  {m.name}
                </RowTitle>
              </RowMain>
              <RowSlot w={160} align="right">
                <span className="truncate text-sub text-secondary-foreground">{m.customer_name}</span>
              </RowSlot>
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}
