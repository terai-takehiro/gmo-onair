/**
 * 役割をつくる／直す（v4 設定 ③）
 *
 * ── 直したときに「押してある人」へ反映するかを必ず訊く ──────
 *
 * 型を直すだけで全員の権限が黙って変わると、変えた本人にも
 * **誰の何が変わったのか分かりません**。人数を出して選んでもらいます。
 * 既定は「反映しない」— 反映しないほうが取り返しがつくためです。
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Info } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { MODULE_WHAT, LEVEL_CHOICES, LEVEL_TONE, ROLE_MODULE_ORDER } from './moduleLabels';
import { MODULE_LABELS } from '@/contexts/platform/AuthContext';
import type { Role } from './types';

interface Props {
  /** null = 新しくつくる */
  role: Role | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function RoleDialog({ role, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [levels, setLevels] = useState<Record<string, string>>({});
  const [reapply, setReapply] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? '');
    setDesc(role?.description ?? '');
    setLevels({ ...(role?.modules ?? {}) });
    setReapply(false);
  }, [open, role]);

  const save = useMutation({
    mutationFn: async () => {
      const modules: Record<string, string> = {};
      for (const m of ROLE_MODULE_ORDER) if (levels[m]) modules[m] = levels[m];
      if (role) {
        return (await api.put(`/permission-roles/${role.id}`, {
          name, description: desc, modules, reapply,
        })).data.data as { applied: { name: string }[] };
      }
      await api.post('/permission-roles', { name, description: desc, modules });
      return { applied: [] as { name: string }[] };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['permission-roles'] });
      // 権限が変わった人がいるなら、その人の権限の表示もつくり直す
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user-permissions'] });
      const n = data.applied?.length ?? 0;
      notifySuccess(role ? '役割を直しました' : '役割をつくりました', {
        description: n > 0 ? `この役割の ${n} 名にも反映しました。` : undefined,
      });
      onOpenChange(false);
    },
    onError: (e) => notifyApiError(role ? '役割を直せませんでした' : '役割をつくれませんでした', e),
  });

  const members = role?.member_count ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? `${role.name} を直す` : '役割をつくる'}</DialogTitle>
          <DialogDescription>
            ここで決めた中身が、この役割を押した人の権限になります。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="role-name">名前</Label>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="営業担当" />
            </div>
            <div>
              <Label htmlFor="role-desc">どんな役割か</Label>
              <Input id="role-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="自分の案件を作る・直す" />
            </div>
          </div>

          <div className="rounded-card overflow-hidden border border-border">
            {ROLE_MODULE_ORDER.map((m) => {
              const lv = levels[m] ?? 'none';
              return (
                <div key={m} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-3.5 py-2.5 last:border-b-0">
                  <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <span className="text-list block">{MODULE_LABELS[m] ?? m}</span>
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

          <p className="rounded-note text-note flex items-start gap-2 border border-info-border bg-info-surface px-3.5 py-3 text-secondary-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
            <span>
              制作資料・技術資料・計時LIVE・リアルタイムCG は<strong className="font-bold">この表にありません</strong>。
              役割を押しても<strong className="font-bold">その4つの権限は変わりません</strong>
              （放送で使うため、役割の付け替えで消えないようにしてあります）。
              付け外しは一人ずつの「権限の例外」から行います。
            </span>
          </p>

          {role && members > 0 && (
            <label className="rounded-note flex cursor-pointer items-start gap-2.5 border border-warning-border bg-warning-surface px-3.5 py-3">
              <input
                type="checkbox"
                checked={reapply}
                onChange={(e) => setReapply(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="text-note text-warning-foreground">
                この役割の <strong className="font-bold">{members} 名</strong>にも反映する
                <span className="mt-0.5 block">
                  チェックを外したままだと、<strong className="font-bold">これから押す人にだけ</strong>新しい中身が効きます。
                  いまこの役割の人の権限はそのままです。
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>やめる</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {role ? '保存する' : 'つくる'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
