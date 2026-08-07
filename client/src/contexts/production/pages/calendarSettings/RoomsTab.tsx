/**
 * ④ 設定 / 部屋（カレンダー・v4）
 *
 * **ここは読むだけ**です。足す・直す・消すは今までの
 * `StudioRoomsManagerDialog` をそのまま開きます（中身を作り替えない）。
 *
 * ── 色を出す理由 ────────────────────────────────────────────
 *
 * 部屋の色は**予定の帯と「部屋の空き」の帯にそのまま出ます**。
 * 一覧で色が見えないと、似た色を2つ作ってしまい、
 * カレンダーの上でどちらの部屋か読めなくなります。
 */
import { DoorOpen, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import type { LocationRow } from './types';

const ROOM_TYPE_LABEL: Record<string, string> = {
  studio: 'スタジオ', greenroom: '控室', control: '調整室', other: 'その他',
};

export function RoomsTab({
  locations, loading, canEdit, onManage,
}: {
  locations: LocationRow[];
  loading: boolean;
  canEdit: boolean;
  onManage: () => void;
}) {
  if (loading) return <Delayed><SkeletonRows rows={5} /></Delayed>;

  const total = locations.reduce((n, l) => n + (l.rooms?.length ?? 0), 0);
  if (total === 0) {
    return (
      <EmptyState
        icon={<DoorOpen className="h-6 w-6" aria-hidden="true" />}
        title="部屋が登録されていません"
        description="拠点と部屋を登録すると、予定の帯と「部屋の空き」に並びます。"
        action={canEdit ? <Button onClick={onManage}>部屋を管理する</Button> : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sub min-w-0 flex-1 text-muted-foreground">
          拠点 <span className="font-number font-bold">{locations.length}</span> ／
          部屋 <span className="font-number font-bold">{total}</span>
        </p>
        {canEdit && (
          <Button variant="outline" onClick={onManage}>
            <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />部屋を管理する
          </Button>
        )}
      </div>

      {locations.map((loc) => (
        <section key={loc.id} className="rounded-card overflow-hidden border border-border bg-card">
          <div className="border-b border-border-faint bg-surface-subtle px-4 py-2.5">
            <h2 className="text-cardtitle">{loc.name}</h2>
            <p className="text-note text-muted-foreground">{loc.rooms?.length ?? 0} 部屋</p>
          </div>

          {(loc.rooms ?? []).length === 0 ? (
            <p className="text-sub px-4 py-5 text-center text-muted-foreground">この拠点には部屋がありません</p>
          ) : (
            <>
              <RowHeader className="hidden sm:flex">
                <RowSlot w={56}>色</RowSlot>
                <RowMain>部屋</RowMain>
                <RowSlot w={72}>略称</RowSlot>
                <RowSlot w={96}>種類</RowSlot>
              </RowHeader>
              {(loc.rooms ?? []).map((r) => (
                <Row key={r.id}>
                  <RowSlot w={56}>
                    <span
                      className="rounded-note inline-block h-5 w-5 border border-border-faint"
                      style={{ background: r.color || '#94a3b8' }}
                      aria-label={`色 ${r.color || '未設定'}`}
                    />
                  </RowSlot>
                  <RowMain>
                    <RowTitle>{r.name}</RowTitle>
                    <RowSub>{r.color || '色が設定されていません'}</RowSub>
                  </RowMain>
                  <RowSlot w={72} hideOnMobile>
                    <span className="text-sub-sm text-secondary-foreground">{r.abbreviation || '—'}</span>
                  </RowSlot>
                  <RowSlot w={96}>
                    <TableBadge
                      label={ROOM_TYPE_LABEL[r.room_type ?? ''] ?? 'その他'}
                      w={null}
                      className="w-full border-transparent bg-surface-subtle text-secondary-foreground"
                    />
                  </RowSlot>
                </Row>
              ))}
            </>
          )}
        </section>
      ))}

      <p className="text-note text-muted-foreground">
        部屋の色は<strong className="font-bold">予定の帯と「部屋の空き」にそのまま出ます</strong>。
        似た色を2つ作ると、カレンダーの上でどちらの部屋か読めなくなります。
        {!canEdit && <>　足す・直すができるのは<strong className="font-bold">管理者</strong>だけです。</>}
      </p>
    </div>
  );
}
