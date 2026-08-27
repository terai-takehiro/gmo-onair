/**
 * ③ プロジェクト詳細「体制」 — 組織図 (v4・モックの `GP_ORG2`・migration 169)
 *
 * ── 3段の箱で描く ──────────────────────────────────────────
 *
 *   上段（決める人）    オブザーバー ／ 責任者（オーナー） ／ 管理業務・財務
 *   中段（進める人）    全体統括（PM会社）
 *   下段（手を動かす人）設計ユニット ／ テクニカルユニット ／ 施工ユニット
 *
 * **箱は「`group_label` が同じ人の集まり」**です。箱そのものの表は作っていません
 * — 箱に持たせる値が無く、分けると人を消したときに空の箱が残ります。
 *
 * ── 線は CSS で引く ────────────────────────────────────────
 *
 * SVG で座標を計算して線を引くと、**画面幅が変わるたびに線がずれます**
 * （箱の高さは中の人数で変わる）。上下のつながりだけを縦線で示し、
 * 横の並びは「同じ段にある」ことで表します。スマホでは1列に積まれ、
 * 段の見出しがそのまま順序になります。
 *
 * ── 立場の色 ────────────────────────────────────────────────
 *
 * 枠の色は**段ではなく立場**（自社 / 発注者 / PM会社 / 業者）で決めます。
 * 段は縦の位置で分かるので、色は「どこの会社か」に使うほうが役に立ちます。
 */
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Mail, Pencil, Plus, Trash2, Users } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useInvalidateGpm } from '../../queries';
import {
  SIDE_BORDER, SIDE_LABEL, SIDE_TONE, TIER_LABEL,
  type GpmMember, type MemberTier,
} from '../../types';
import { MemberDialog } from './MemberDialog';

const TIERS: MemberTier[] = ['top', 'lead', 'unit'];

/** 箱1つ ＝ 同じ `group_label` の人の集まり */
interface Box {
  key: string;
  label: string;
  members: GpmMember[];
}

/** 段ごとに箱へ束ねる。`group_label` が空の人は**立場の名前の箱**に入れる */
function boxesOf(members: GpmMember[], tier: MemberTier): Box[] {
  const rows = members.filter((m) => (m.tier ?? 'unit') === tier);
  const map = new Map<string, Box>();
  for (const m of rows) {
    const label = m.group_label?.trim() || SIDE_LABEL[m.side];
    const box = map.get(label) ?? { key: label, label, members: [] };
    box.members.push(m);
    map.set(label, box);
  }
  return [...map.values()];
}

export function MembersTab({
  projectId, members, canEdit,
}: {
  projectId: string;
  members: GpmMember[];
  canEdit: boolean;
}) {
  const invalidate = useInvalidateGpm();
  const [editing, setEditing] = useState<GpmMember | null>(null);
  const [addingTier, setAddingTier] = useState<MemberTier | null>(null);

  const tiers = useMemo(
    () => TIERS.map((t) => ({ tier: t, boxes: boxesOf(members, t) })),
    [members],
  );

  const remove = useMutation({
    mutationFn: (m: GpmMember) => api.delete(`/gpm/members/${m.id}`),
    onSuccess: () => { invalidate(projectId); notifySuccess('体制から外しました'); },
    onError: (e) => notifyApiError('外せませんでした', e),
  });

  const onRemove = async (m: GpmMember) => {
    const ok = await confirmAction({
      title: `${m.name} さんを体制から外しますか？`,
      description: 'この人だけが入っている箱なら、箱ごと消えます。プロジェクトそのものは変わりません。',
      confirmLabel: '外す',
      tone: 'danger',
    });
    if (ok) remove.mutate(m);
  };

  if (members.length === 0) {
    return (
      <div className="p-4 lg:p-6">
        <EmptyState
          icon={<Users className="h-6 w-6" aria-hidden="true" />}
          title="体制はまだ入っていません"
          description="発注者・PM会社・自社・業者の担当者を、決める人／進める人／手を動かす人 の3段に並べます。"
          action={canEdit ? <Button onClick={() => setAddingTier('top')}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />人を足す</Button> : undefined}
        />
        {addingTier && (
          <MemberDialog projectId={projectId} tier={addingTier} member={null} onClose={() => setAddingTier(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      {tiers.map(({ tier, boxes }, i) => (
        <div key={tier}>
          {/* 段のあいだの縦線。**上下のつながりだけを示す** */}
          {i > 0 && <div className="mx-auto h-5 w-px bg-border" aria-hidden="true" />}

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-cardtitle">{TIER_LABEL[tier]}</h2>
            <span className="text-note text-muted-foreground">
              {boxes.reduce((n, b) => n + b.members.length, 0)}名
            </span>
            <div className="flex-1" />
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setAddingTier(tier)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />この段に足す
              </Button>
            )}
          </div>

          {boxes.length === 0 ? (
            <p className="rounded-card border border-dashed border-border px-4 py-3 text-sub text-muted-foreground">
              この段はまだ空です。
            </p>
          ) : (
            <div className={cn(
              'grid grid-cols-1 gap-2.5',
              // 中段は1つのことが多いので広く取る。上段と下段は横に並べる
              tier === 'lead' ? 'lg:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3',
            )}>
              {boxes.map((b) => (
                <BoxCard
                  key={b.key}
                  box={b}
                  canEdit={canEdit}
                  onEdit={setEditing}
                  onRemove={onRemove}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      <p className="text-note pt-2 text-muted-foreground">
        枠の色は<strong className="font-bold">立場</strong>（自社・発注者・PM会社・業者）です。
        段は上から「決める人 → 進める人 → 手を動かす人」。
        箱は<strong className="font-bold">同じ「まとまりの名前」を入れた人</strong>が1つになります。
      </p>

      {(addingTier || editing) && (
        <MemberDialog
          projectId={projectId}
          tier={addingTier ?? (editing!.tier ?? 'unit')}
          member={editing}
          onClose={() => { setAddingTier(null); setEditing(null); }}
        />
      )}
    </div>
  );
}

function BoxCard({
  box, canEdit, onEdit, onRemove,
}: {
  box: Box;
  canEdit: boolean;
  onEdit: (m: GpmMember) => void;
  onRemove: (m: GpmMember) => void;
}) {
  // 箱の枠は**中の人の立場**で決める。混ざっているときは最初の人に合わせる
  const side = box.members[0]?.side ?? 'internal';

  return (
    <section className={cn('rounded-card overflow-hidden border-2 bg-card', SIDE_BORDER[side])}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-subtle px-3 py-2">
        <h3 className="text-list min-w-0 flex-1 truncate">{box.label}</h3>
        <span className={cn('text-badge rounded-badge px-1.5 py-0.5', SIDE_TONE[side])}>
          {SIDE_LABEL[side]}
        </span>
      </div>
      <ul>
        {box.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 border-b border-border-faint px-3 py-2 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="text-list flex flex-wrap items-center gap-1.5">
                <span className="truncate">{m.name}</span>
                {m.badge && (
                  <span className="text-badge shrink-0 rounded-badge-xs bg-warning-surface px-1.5 py-0.5 text-warning">
                    {m.badge}
                  </span>
                )}
              </span>
              <span className="text-sub-sm block truncate text-muted-foreground">
                {[m.role, m.org].filter(Boolean).join(' ・ ') || '役割 未設定'}
              </span>
              {m.email && (
                <a
                  href={`mailto:${m.email}`}
                  className="text-sub-sm inline-flex min-w-0 max-w-full items-center gap-1 truncate text-primary hover:underline"
                >
                  <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{m.email}</span>
                </a>
              )}
            </span>
            {canEdit && (
              <span className="flex shrink-0 gap-0.5">
                <Button variant="ghost" size="icon-sm" onClick={() => onEdit(m)} aria-label={`${m.name} を直す`}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost" size="icon-sm" className="text-destructive"
                  onClick={() => onRemove(m)} aria-label={`${m.name} を外す`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
