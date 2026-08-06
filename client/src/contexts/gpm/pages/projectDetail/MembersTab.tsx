/**
 * ③ プロジェクト詳細「体制」 — 誰が何をする人か
 *
 * ── モックの組織図（箱と線）にしていない ────────────────────
 *
 * モックの `GP_ORG` は発注者 → PM会社 → 設計 → 施工 を箱と線で描きます。
 * 図の描画（座標・線の引き回し・つなぎ替え）は**画面の作り直しとは別の仕事**
 * なので、まず**立場ごとに分けた一覧**にしました
 * （`docs/design/gpm-model.md`「やらないと決めたこと」）。
 *
 * ── いまは読むだけ ──────────────────────────────────────────
 *
 * `gpm_members` に**書き込む API がありません**（`GET /gpm/projects/:id` が
 * 返すだけ）。押しても何も起きないボタンを置かないので、
 * 「足す」ボタンは出さず、**入れる口がまだ無いことを画面に書きます**。
 */
import { Users } from 'lucide-react';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { SIDE_LABEL, SIDE_TONE, type GpmMember, type MemberSide } from '../../types';

const SIDES: MemberSide[] = ['client', 'pm', 'internal', 'vendor'];

export function MembersTab({ members }: { members: GpmMember[] }) {
  if (members.length === 0) {
    return (
      <div className="p-4 lg:p-6">
        <EmptyState
          icon={<Users className="h-6 w-6" aria-hidden="true" />}
          title="体制はまだ入っていません"
          description="発注者・PM会社・自社・業者の担当者をここに並べます。いまは読むだけで、入れる口がサーバーにまだありません。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      {SIDES.map((side) => {
        const rows = members.filter((m) => m.side === side);
        if (rows.length === 0) return null;
        return (
          <section key={side} className="rounded-card overflow-hidden border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-subtle px-4 py-2.5">
              <h2 className="text-cardtitle">{SIDE_LABEL[side]}</h2>
              <span className="text-sub-sm font-number text-muted-foreground">{rows.length}名</span>
            </div>
            {rows.map((m) => (
              <Row key={m.id} divider stackOnMobile>
                <RowMain>
                  <RowTitle>{m.name}</RowTitle>
                  <RowSub>
                    {[m.org, m.email].filter(Boolean).join(' ・ ') || '所属 未設定'}
                  </RowSub>
                </RowMain>
                <RowSlot w={128} className="text-sub" hideOnMobile>{m.role}</RowSlot>
                <TableBadge w={96} label={SIDE_LABEL[m.side]} className={SIDE_TONE[m.side]} />
              </Row>
            ))}
          </section>
        );
      })}

      <p className="text-note text-muted-foreground">
        いまは読むだけです。人を足す・直すのはサーバー側に口ができてからになります。
        組織図（箱と線でつながりを描くもの）はモックにありますが、図の描画は別の作業として分けています。
      </p>
    </div>
  );
}
