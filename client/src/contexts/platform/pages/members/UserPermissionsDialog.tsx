/**
 * 一人ずつの「権限の例外」（v4 設定 ③）
 *
 * ── 役割があるのに、なぜ個人の画面が要るのか ────────────────
 *
 * 2 つ理由があります。
 *
 * 1. **凍結4アプリ（制作資料・技術資料・計時LIVE・リアルタイムCG）は
 *    役割の担当範囲の外**です。役割を押しても変わらないので、
 *    付け外しはここが唯一の場所になります。
 * 2. 「この人だけ例外」を認める設計にしたため（役割は型であって檻ではない）。
 *
 * 役割と食い違う区画には印を出します。**黙ってずれていると、
 * 「役割を見れば分かる」と思ったまま実際は違う**が起きるためです。
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { MODULE_LABELS } from '@/contexts/platform/AuthContext';
import {
  ALL_MODULE_ORDER, ROLE_MODULE_ORDER, MODULE_WHAT, LEVEL_CHOICES, LEVEL_TONE,
} from './moduleLabels';
import type { Member, Role } from './types';

/** DB に残る旧レベル（5段のころの値）を、いまの3段に読み替える */
function normalize(level: string | undefined): string | undefined {
  if (!level) return level;
  if (level === 'exporter') return 'reader';
  if (level === 'owner') return 'manager';
  return level;
}

interface Props {
  user: Member | null;
  /** その人に押してある役割（あれば、ずれを出す） */
  role: Role | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function UserPermissionsDialog({ user, role, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [levels, setLevels] = useState<Record<string, string>>({});
  const isAdmin = user?.role === 'system_admin';

  const q = useQuery<{ module: string; access_level: string }[]>({
    queryKey: ['user-permissions', user?.id],
    queryFn: async () => (await api.get(`/users/${user!.id}/permissions`)).data.data,
    enabled: open && !!user && !isAdmin,
  });

  useEffect(() => {
    if (!open) { setLevels({}); return; }
    if (!q.data) return;
    const map: Record<string, string> = {};
    for (const p of q.data) {
      const n = normalize(p.access_level);
      if (n) map[p.module] = n;
    }
    setLevels(map);
  }, [open, q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const permissions: Record<string, string | null> = {};
      for (const m of ALL_MODULE_ORDER) permissions[m] = levels[m] || null;
      await api.put(`/users/${user!.id}/permissions`, { permissions });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-permissions', user?.id] });
      qc.invalidateQueries({ queryKey: ['permission-roles'] });
      notifySuccess('権限を保存しました', { description: '本人がログインし直すと効きます。' });
      onOpenChange(false);
    },
    onError: (e) => notifyApiError('権限を保存できませんでした', e),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>権限の例外 — {user?.name}</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? 'システム管理者はすべての区画を通ります。ここでの指定は使われません。'
              : role
                ? `役割「${role.name}」を押してあります。ここで直すと、その役割とは違う持ち方になります。`
                : '役割を押していないので、ここで指定したものがそのまま権限になります。'}
          </DialogDescription>
        </DialogHeader>

        {isAdmin ? (
          <p className="rounded-note border border-info-border bg-info-surface px-3.5 py-3 text-sub text-secondary-foreground">
            この人は<strong className="font-bold">システム管理者</strong>です。
            すべての判定を素通りするため、区画ごとの指定は効きません。
            絞りたいときは、まず「スタッフ」に変えてください。
          </p>
        ) : q.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          </div>
        ) : (
          <div className="rounded-card overflow-hidden border border-border">
            {ALL_MODULE_ORDER.map((m) => {
              const lv = levels[m] ?? 'none';
              const inRole = (ROLE_MODULE_ORDER as readonly string[]).includes(m);
              const wanted = role && inRole ? (role.modules[m] ?? 'none') : null;
              const drift = wanted !== null && wanted !== lv;
              return (
                <div key={m} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-3.5 py-2.5 last:border-b-0">
                  <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <span className="text-list flex items-center gap-1.5">
                      {MODULE_LABELS[m] ?? m}
                      {!inRole && (
                        <span className="text-note rounded-note bg-muted px-1.5 font-bold text-muted-foreground">
                          役割の対象外
                        </span>
                      )}
                      {drift && (
                        <span className="text-note inline-flex items-center gap-1 font-bold text-warning">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          役割は「{LEVEL_CHOICES.find((c) => c.value === wanted)?.label}」
                        </span>
                      )}
                    </span>
                    <span className="text-note block text-muted-foreground">{MODULE_WHAT[m]}</span>
                  </span>
                  <div className="flex shrink-0 gap-1">
                    {LEVEL_CHOICES.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        title={c.hint}
                        onClick={() => setLevels((p) => {
                          const next = { ...p };
                          if (c.value === 'none') delete next[m]; else next[m] = c.value;
                          return next;
                        })}
                        className={cn(
                          'text-note min-h-tap rounded-note border px-2.5 font-bold lg:min-h-[32px]',
                          lv === c.value
                            ? `border-transparent ${LEVEL_TONE[c.value]}`
                            : 'border-border bg-card text-muted-foreground',
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isAdmin ? '閉じる' : 'やめる'}
          </Button>
          {!isAdmin && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              保存する
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
