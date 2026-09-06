/**
 * 役割を追加／編集する（v4 設定 ③）
 *
 * ── 直したときに「押してある人」へ反映するかを必ず訊く ──────
 *
 * 型を書き換えるだけで全員の権限が黙って変わると、変えた本人にも
 * **誰の何が変わったのか分かりません**。人数を出して選んでもらいます。
 * 既定は「反映しない」— 反映しないほうが取り返しがつくためです。
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { MODULE_WHAT, MODULE_WHAT_DETAIL, MODULE_TITLE, LEVEL_CHOICES, LEVEL_TONE, ROLE_MODULE_ORDER } from './moduleLabels';
import { MODULE_LABELS, useAuth } from '@/contexts/platform/AuthContext';
import type { Role } from './types';

interface Props {
  /** null = 新しくつくる */
  role: Role | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function RoleDialog({ role, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { refreshPermissions } = useAuth();
  // **初期値は props から遅延初期化する**（呼び出し側が対象ごとに `key` を変えて
  // 作り直す前提。`useEffect` だけに任せると、対象を切り替えた1フレーム目は
  // 前の対象の値のまま描画されてしまう）
  const [name, setName] = useState(() => role?.name ?? '');
  const [desc, setDesc] = useState(() => role?.description ?? '');
  const [levels, setLevels] = useState<Record<string, string>>(() => ({ ...(role?.modules ?? {}) }));
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
      // `AuthContext.permissions` は react-query の外にあるので上の invalidate では
      // 更新されない。自分の役割を直した場合はここで読み直さないと、
      // 保存したのにメニュー・ボタンが古い権限のままリロードまで残る
      void refreshPermissions();
      const n = data.applied?.length ?? 0;
      notifySuccess(role ? '役割を編集しました' : '役割を作成しました', {
        description: n > 0 ? `この役割の ${n} 名にも反映しました。` : undefined,
      });
      onOpenChange(false);
    },
    onError: (e) => notifyApiError(role ? '役割を保存できませんでした' : '役割を追加できませんでした', e),
  });

  const members = role?.member_count ?? 0;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={role ? `${role.name} を編集` : '役割を追加'}
      sub="ここで決めた中身が、この役割の人の権限になります。"
      // 打つ欄は名前と説明の2つだけなので Enter で送れるようにする
      // （権限の12区画はすべて `type="button"` のボタンなので送信しない）
      onSubmit={(e) => { e.preventDefault(); if (name.trim() && !save.isPending) save.mutate(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button type="submit" disabled={!name.trim() || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {role ? '保存' : '追加'}
          </Button>
        </FormDialogFooter>
      }
    >
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="role-name">名前</Label>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="営業担当" />
            </div>
            <div>
              <Label htmlFor="role-desc">どんな役割か</Label>
              <Input id="role-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="自分の案件を作る・編集する" />
            </div>
          </div>

          {/*
            **「この役割の N 名にも反映する」は権限の表より上。** これから触る
            12 区画の変更が**いまこの役割の人に効くのかどうか**を決めるスイッチで、
            表の下にあると、押し終わってから前提が変わることになる。
          */}
          {role && members > 0 && (
            <label className="rounded-note flex cursor-pointer items-start gap-2.5 border border-warning-border bg-warning-surface px-3.5 py-3">
              <input
                type="checkbox"
                checked={reapply}
                onChange={(e) => setReapply(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="text-note text-secondary-foreground">
                この役割の <strong className="font-bold">{members} 名</strong>にも反映する
                <span className="mt-0.5 block">
                  チェックを外したままだと、<strong className="font-bold">これから押す人にだけ</strong>新しい中身が効きます。
                  いまこの役割の人の権限はそのままです。
                </span>
              </span>
            </label>
          )}

          <div className="rounded-card overflow-hidden border border-border">
            {ROLE_MODULE_ORDER.map((m) => {
              const lv = levels[m] ?? 'none';
              return (
                <div key={m} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-3.5 py-2.5 last:border-b-0">
                  <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <span className="text-list block">{MODULE_TITLE[m] ?? MODULE_LABELS[m] ?? m}</span>
                    {/* 内訳（12 項目の列挙）は副題に出すと読めないのでツールチップへ */}
                    <span className="text-note block text-muted-foreground" title={MODULE_WHAT_DETAIL[m] ?? MODULE_WHAT[m]}>{MODULE_WHAT[m]}</span>
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
        </div>
    </FormDialog>
  );
}
