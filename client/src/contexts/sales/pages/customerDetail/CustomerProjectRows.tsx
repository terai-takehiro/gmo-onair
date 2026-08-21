/**
 * お客様の詳細（顧客360）— 案件リスト（PC・行表示） (v4)
 *
 * ステージのバッジは**案件一覧と同じ表**（`projectList/stages.ts` の
 * `STAGE_BADGE_LABEL` / `STAGE_BADGE_TONE`）を読む。書き写すと、
 * 同じ案件が一覧と顧客360で違う色・違う文字のバッジになる。
 */
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { STAGE_BADGE_LABEL, STAGE_BADGE_TONE } from '../projectList/stages';
import type { CustomerProject } from './types';
import type { ProjectStage } from '@/types';

export function CustomerProjectRows({
  items, onOpen,
}: {
  items: CustomerProject[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-col">
      {items.map((p) => {
        const stage = p.stage as ProjectStage;
        const rev = Number(p.total_revenue) || 0;
        const pur = Number(p.total_purchase) || 0;
        const gp = rev - pur;
        const hasActuals = rev > 0 || pur > 0;
        const expected = Number(p.expected_amount) || 0;

        return (
          <Row
            key={p.id}
            divider
            interactive
            role="button"
            tabIndex={0}
            onClick={() => onOpen(p.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p.id); } }}
            className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RowMain>
              <RowTitle>{p.name}</RowTitle>
              <RowSub>{p.gls_number || p.code || '社内コード未設定'}</RowSub>
            </RowMain>

            <TableBadge w={96} label={STAGE_BADGE_LABEL[stage] ?? p.stage} className={STAGE_BADGE_TONE[stage]} />

            <RowSlot w={96} hideOnMobile>
              {p.event_start ? <span className="font-number text-sub">{p.event_start.replace(/-/g, '/')}</span> : null}
            </RowSlot>

            <RowSlot w={160} align="right" hideOnMobile className="flex-col items-end justify-center gap-0.5">
              {hasActuals ? (
                <>
                  <Money inline value={rev} className="text-sub" />
                  <span className="text-sub-sm text-muted-foreground">
                    粗利 <Money inline value={gp} className="text-sub-sm" negativeIsDanger />
                  </span>
                </>
              ) : expected > 0 ? (
                <Money inline value={expected} className="text-sub text-muted-foreground" title="想定金額（まだ見積を出していません）" />
              ) : null}
            </RowSlot>
          </Row>
        );
      })}
    </div>
  );
}
