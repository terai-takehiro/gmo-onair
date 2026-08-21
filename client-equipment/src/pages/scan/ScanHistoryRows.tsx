/**
 * さっき読んだもの — PC（`Row` の表）
 */
import { useNavigate } from 'react-router-dom';
import { History } from 'lucide-react';
import { Row, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { hm, type ScanRow } from './useScanHistory';

export function ScanHistoryRows({ rows, isLoading }: { rows: ScanRow[]; isLoading: boolean }) {
  const navigate = useNavigate();

  return (
    <section className="flex flex-col gap-2" aria-labelledby="scan-history">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="scan-history" className="text-h2">さっき読んだもの</h2>
        <span className="text-sub text-muted-foreground">自分のぶん・新しい順</span>
      </div>

      {isLoading ? (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState title="まだ読んでいません" description="カメラで読むか、ID を打つとここに残ります。" />
      ) : (
        <div className="flex flex-col rounded-card border border-border bg-card">
          {rows.map((r) => (
            <Row
              key={r.id}
              divider
              interactive={!!r.equipment_id}
              onClick={r.equipment_id ? () => navigate(`/equipment/items/${r.equipment_id}`) : undefined}
            >
              <RowMain>
                <RowTitle>
                  {r.equipment_name ?? (
                    // **見つからなかったことを書く。** 消すと「読めないシール」に気づけない
                    <span className="text-warning">見つかりませんでした</span>
                  )}
                </RowTitle>
                <RowSub>
                  <span className="font-number">{r.raw_code}</span>
                  {r.unit_number != null && ` ・ No.${r.unit_number}`}
                </RowSub>
              </RowMain>
              <RowSlot w={96} align="right">
                <span className="font-number text-sub-sm text-muted-foreground">{hm(r.scanned_at)}</span>
              </RowSlot>
            </Row>
          ))}
        </div>
      )}
    </section>
  );
}
