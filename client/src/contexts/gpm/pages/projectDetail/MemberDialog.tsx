/**
 * 体制に人を足す・直す (v4 GPM・migration 169)
 *
 * ── 「チーム名」が箱になる ──────────────────────────────────
 *
 * 同じ名前を入れた人が組織図の1つの箱に入ります。すでにある名前は
 * 選べるようにしてあります — **打ち間違いで箱が2つに割れる**のがいちばん困るので
 * （「設計ユニット」と「設計ユニット 」で別の箱になる）。
 *
 * ── ONAiR の利用者と結ぶのは任意 ────────────────────────────
 *
 * 社外の人が多いので、**名前だけで登録できます**。結んでおくと
 * あとでタスクの担当に使えますが、それは別の作業なのでここでは強制しません。
 */
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useGpmProject, useInvalidateGpm } from '../../queries';
import { SIDE_LABEL, TIER_LABEL, TIER_NOTE, type GpmMember, type MemberSide, type MemberTier } from '../../types';

const SIDES: MemberSide[] = ['client', 'pm', 'internal', 'vendor'];
const TIERS: MemberTier[] = ['top', 'lead', 'unit'];

/** モックに出てくる印。**自由入力もできる**ようにテキストで持つ */
const BADGE_HINTS = ['決裁', '進行', '議事録'];

export function MemberDialog({
  projectId, tier, member, onClose,
}: {
  projectId: string;
  tier: MemberTier;
  member: GpmMember | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidateGpm();
  const { data: project } = useGpmProject(projectId);

  const [form, setForm] = useState({
    name: member?.name ?? '',
    org: member?.org ?? '',
    role: member?.role ?? '',
    email: member?.email ?? '',
    side: (member?.side ?? 'internal') as MemberSide,
    tier: (member?.tier ?? tier) as MemberTier,
    group_label: member?.group_label ?? '',
    badge: member?.badge ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  /** すでにある箱の名前。**打ち間違いで箱が割れる**のを防ぐために選べるようにする */
  const existingGroups = useMemo(() => {
    const set = new Set<string>();
    for (const m of project?.members ?? []) {
      if (m.group_label?.trim()) set.add(m.group_label.trim());
    }
    return [...set];
  }, [project]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        org: form.org || null,
        role: form.role || null,
        email: form.email || null,
        group_label: form.group_label || null,
        badge: form.badge || null,
      };
      return member
        ? api.put(`/gpm/members/${member.id}`, body)
        : api.post(`/gpm/projects/${projectId}/members`, body);
    },
    onSuccess: () => {
      invalidate(projectId);
      notifySuccess(member ? '直しました' : '体制に足しました');
      onClose();
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      setError(err?.response?.data?.error?.message ?? '保存できませんでした');
      notifyApiError('保存できませんでした', e);
    },
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={member ? '体制の人を編集' : '体制に人を追加'}
      size="lg"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={() => { setError(null); save.mutate(); }} disabled={!form.name.trim() || save.isPending}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {member ? '編集' : '追加'}
          </Button>
        </FormDialogFooter>
      }
    >
        {/* 保存できなかった理由は**上辺に固定**する（本文末尾だと画面外で気づかれない） */}
        {error && (
          <p className="rounded-control border border-destructive-border bg-destructive-surface px-3 py-2 text-sub text-destructive">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>名前 *</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="井上 直樹" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>立場 *</Label>
              <Select value={form.side} onValueChange={(v) => set('side', v as MemberSide)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIDES.map((s) => <SelectItem key={s} value={s}>{SIDE_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>役割の層 *</Label>
              <Select value={form.tier} onValueChange={(v) => set('tier', v as MemberTier)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => <SelectItem key={t} value={t}>{TIER_LABEL[t]}（{TIER_NOTE[t]}）</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-note text-muted-foreground">上から 決裁層 → 推進層 → 実務層 の3段です。</p>
            </div>
          </div>

          <div className="space-y-1">
            <Label>チーム名</Label>
            <Input
              list="gpm-group-labels"
              value={form.group_label}
              onChange={(e) => set('group_label', e.target.value)}
              placeholder="例: 設計ユニット"
            />
            <datalist id="gpm-group-labels">
              {existingGroups.map((g) => <option key={g} value={g} />)}
            </datalist>
            <p className="text-note text-muted-foreground">
              同じ名前を入れた人が組織図の1つの箱に入ります。空なら立場の名前でまとまります。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>役割</Label>
              <Input value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="AV設計・機材選定" />
            </div>
            <div className="space-y-1">
              <Label>所属</Label>
              <Input value={form.org} onChange={(e) => set('org', e.target.value)} placeholder="日建スペースデザイン" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>メール</Label>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>バッジ（表示ラベル）</Label>
              <Input
                list="gpm-badges"
                value={form.badge}
                onChange={(e) => set('badge', e.target.value)}
                placeholder="決裁"
              />
              <datalist id="gpm-badges">
                {BADGE_HINTS.map((b) => <option key={b} value={b} />)}
              </datalist>
            </div>
          </div>
        </div>
    </FormDialog>
  );
}
