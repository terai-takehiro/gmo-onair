/**
 * メンバーを招く／直す（v4 設定 ③）
 *
 * ── 招くときに役割まで決める ────────────────────────────────
 *
 * 旧画面は**権限ゼロで招待し、あとから 🔑 で 12 区画を1つずつ押す**形でした。
 * 押し忘れると本人は「開けません」としか分からず、押した側も気づけません。
 * ここでは役割を選ばせ、**招いた瞬間に権限が入る**ようにします。
 *
 * `role`（system_admin / staff）と役割は別物なので、画面でもはっきり分けます。
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Copy, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useAuth } from '@/contexts/platform/AuthContext';
import type { Member, Role } from './types';

interface Props {
  /** null = 新しく招く */
  user: Member | null;
  roles: Role[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function UserDialog({ user, roles, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { currentUser, refreshPermissions } = useAuth();
  const isSelf = !!user && !!currentUser && user.id === currentUser.id;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sysRole, setSysRole] = useState('staff');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setInviteUrl(null); return; }
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setSysRole(user?.role === 'system_admin' ? 'system_admin' : 'staff');
    setRoleId(user?.permission_role_id ?? null);
  }, [open, user]);

  const save = useMutation({
    mutationFn: async () => {
      const body = { name, email, role: sysRole };
      const res = user
        ? await api.put(`/users/${user.id}`, body)
        : await api.post('/users', body);
      const id = user?.id ?? (res.data.data?.id as string | undefined);
      // 役割は別の口。**利用者を作れてから押す**（作成が失敗したら押す先が無い）
      if (id && roleId !== (user?.permission_role_id ?? null)) {
        await api.put(`/permission-roles/assign/${id}`, { role_id: roleId });
      }
      return res.data as { inviteUrl?: string };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['permission-roles'] });
      // 自分自身の「システム上の区別」(role) や役割を直したときは、
      // ここが自分の権限を変える唯一の経路（個人ごとの例外編集は廃止済み）。
      // `AuthContext` は react-query の外にあるので、上の invalidate だけでは
      // currentUser.role / permissions が古いまま残る
      if (isSelf) void refreshPermissions();
      if (!user && data?.inviteUrl) { setInviteUrl(data.inviteUrl); return; }
      notifySuccess(user ? '保存しました' : '招待しました');
      onOpenChange(false);
    },
    onError: (e) => notifyApiError(user ? '保存できませんでした' : '招待できませんでした', e),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={inviteUrl ? '招待のリンク' : (user ? 'メンバーを直す' : 'メンバーを招く')}
      sub={inviteUrl
        ? 'この URL を本人に渡してください（7日間だけ使えます）。'
        : (user ? '名前・メール・役割を直します。' : '招待のリンクを出します。役割はここで決められます。')}
      footer={inviteUrl ? (
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>閉じる</Button>
        </FormDialogFooter>
      ) : (
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>やめる</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!name.trim() || !email.trim() || save.isPending}
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {user ? '保存する' : '招待する'}
          </Button>
        </FormDialogFooter>
      )}
    >
      {inviteUrl ? (
        <div className="flex flex-col gap-3">
          <p className="text-sub flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />メンバーをつくりました
          </p>
          <p className="rounded-note text-note select-all break-all bg-muted px-3.5 py-3">{inviteUrl}</p>
          <Button className="w-full" onClick={() => navigator.clipboard.writeText(inviteUrl)}>
            <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />URL をコピーする
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="u-name">氏名</Label>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="u-mail">メール</Label>
            <Input id="u-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div>
            <Label>役割</Label>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRoleId(r.id)}
                  className={cn(
                    'rounded-note min-h-tap flex items-center gap-2.5 border px-3 py-2 text-left',
                    roleId === r.id ? 'border-primary bg-primary-surface' : 'border-border bg-card',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-list block">{r.name}</span>
                    <span className="text-note block text-muted-foreground">{r.description}</span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRoleId(null)}
                className={cn(
                  'rounded-note min-h-tap border px-3 py-2 text-left',
                  roleId === null ? 'border-primary bg-primary-surface' : 'border-border bg-card',
                )}
              >
                <span className="text-list block">役割を決めない</span>
                <span className="text-note block text-muted-foreground">
                  権限は 0 のままです。あとから役割を選び直してください
                </span>
              </button>
            </div>
          </div>

          <div>
            <Label>システム上の区別</Label>
            <div className="mt-1.5 flex gap-1.5">
              {[
                { v: 'staff', l: 'スタッフ', d: '役割と例外のとおりに通ります' },
                { v: 'system_admin', l: 'システム管理者', d: 'すべての判定を素通りします' },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setSysRole(o.v)}
                  className={cn(
                    'rounded-note min-h-tap flex-1 border px-3 py-2 text-left',
                    sysRole === o.v ? 'border-primary bg-primary-surface' : 'border-border bg-card',
                  )}
                >
                  <span className="text-list block">{o.l}</span>
                  <span className="text-note block text-muted-foreground">{o.d}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
