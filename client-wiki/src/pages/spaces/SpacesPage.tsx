/**
 * スペース管理 `/wiki/spaces`（§6-① の「管理」・§8・**PC の画面**）
 *
 * できること: スペースの**追加・編集（名前・説明・閲覧範囲・担当）・削除**と、
 * 閲覧範囲が「メンバーだけ」のスペースの**メンバーの追加・削除**。
 * 区画 `wiki` の **manager** だけが使えます（§8 の表）。
 *
 * ⚠️ **ここにも読めるスペースしか並びません**（§8「存在ごと見えない」）。manager でも、
 * 入っていない「メンバーだけ」のスペースは一覧に出ません。直すときは、そのスペースの
 * メンバーか system_admin に頼みます（サーバー `wiki-space-admin.service.ts` の冒頭）。
 *
 * ⚠️ **行ごと1つのボタンにしています**（テンプレート管理と違い、行の中に他に押せるものが無い）。
 * 押すと編集のシートが開きます。
 */
import { useState } from 'react';
import { FolderCog, Plus } from 'lucide-react';
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import {
  Delayed,
  EmptyState,
  ErrorPanel,
  NoPermissionPanel,
  SkeletonRows,
} from '@gmo-onair/shared/src/client/states';
import { usePermissions } from '@/hooks/usePermissions';
import { stampLabel } from '@/lib/wikiFormat';
import SpaceEditSheet from '@/components/spaces/SpaceEditSheet';
import { useAdminSpaces, VISIBILITY_LABEL, type AdminSpace } from '@/components/spaces/spaceAdminApi';

export default function SpacesPage() {
  const { canManage, permissionsLoading } = usePermissions();
  const spacesQ = useAdminSpaces(canManage);
  const [editing, setEditing] = useState<AdminSpace | null>(null);
  const [open, setOpen] = useState(false);

  const openSheet = (space: AdminSpace | null) => {
    setEditing(space);
    setOpen(true);
  };

  if (permissionsLoading) return null;
  if (!canManage) {
    return (
      <PageShell>
        <NoPermissionPanel modules={['wiki']} level="manager" target="スペース管理" />
      </PageShell>
    );
  }

  const spaces = spacesQ.data ?? [];
  const noOwner = spaces.filter((s) => !s.owner_user_id).length;

  return (
    <PageShell>
      <PageHeader
        title="スペース管理"
        icon={<FolderCog />}
        sub={
          spacesQ.isLoading
            ? undefined
            : [
              `${spaces.length}件`,
              noOwner > 0 ? `担当なし ${noOwner}件（見直しの通知が誰にも届きません）` : '',
            ].filter(Boolean).join(' ・ ')
        }
        primaryAction={
          <Button type="button" onClick={() => openSheet(null)}>
            <Plus className="mr-1 h-4 w-4" />
            スペースを追加
          </Button>
        }
      />

      {spacesQ.isError ? (
        <ErrorPanel
          title="スペースの一覧を読み込めませんでした"
          error={spacesQ.error}
          onRetry={() => void spacesQ.refetch()}
        />
      ) : spacesQ.isLoading ? (
        <Delayed><SkeletonRows rows={6} rowHeight={56} /></Delayed>
      ) : spaces.length === 0 ? (
        <EmptyState
          icon={<FolderCog />}
          title="スペースはまだありません"
          description="「スペースを追加」から、ページを分野ごとにまとめる単位を作成してください。"
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border">
          {spaces.map((s) => (
            <Row key={s.id} divider interactive>
              <RowMain>
                <button
                  type="button"
                  onClick={() => openSheet(s)}
                  className="block w-full text-left"
                  aria-label={`「${s.name}」を編集`}
                >
                  <RowTitle>{s.name}</RowTitle>
                  <RowSub>
                    {`/wiki/s/${s.key}`}
                    {s.description ? ` ・ ${s.description}` : ''}
                  </RowSub>
                </button>
              </RowMain>
              <RowSlot w={128} placeholder="">
                {/*
                  ⚠️ **幅は `fixedW` で2つとも同じにする。** 既定では4字以下だけが 62px に固定され、
                  6字の「メンバーだけ」は自然幅になるので、行ごとにバッジの右端が 26px ずれた
                  （`verify:ui` の「バッジの列がそろう」で実測）。88px は「メンバーだけ」が収まる幅
                */}
                <TableBadge
                  w={null}
                  fixedW={88}
                  label={VISIBILITY_LABEL[s.visibility]}
                  variant={s.visibility === 'members' ? 'info' : 'secondary'}
                />
              </RowSlot>
              <RowSlot w={160} placeholder="担当なし">
                {s.owner_name ?? null}
              </RowSlot>
              <RowSlot w={96} align="right" placeholder="">
                <span className="font-number">{s.page_count ?? 0}</span>
                <span className="text-sub-sm text-muted-foreground"> ページ</span>
              </RowSlot>
              <RowSlot w={96} align="right" placeholder="—">
                {s.visibility === 'members' ? (
                  <>
                    <span className="font-number">{s.member_count ?? 0}</span>
                    <span className="text-sub-sm text-muted-foreground"> 人</span>
                  </>
                ) : null}
              </RowSlot>
              <RowSlot w={128} align="right" placeholder="—">
                {s.last_updated_at ? stampLabel(s.last_updated_at) : null}
              </RowSlot>
            </Row>
          ))}
        </div>
      )}

      <SpaceEditSheet open={open} onOpenChange={setOpen} space={editing} />
    </PageShell>
  );
}
