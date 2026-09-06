/**
 * 按分グループの作成・編集ダイアログ (v4)
 *
 * **メンバーは2案件以上**（`disabled` の条件）。1件だけでは按分にならない。
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { ToggleCard } from '@gmo-onair/shared/src/client/ui/toggle-button-group';
import type { GlsProject, GroupDetail } from './types';

export function GroupFormDialog({
  editing, onClose, onSaved,
}: {
  /** 編集するグループ。`null` なら新規 */
  editing: GroupDetail | null;
  onClose: () => void;
  onSaved: (groupId: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? '');
  const [desc, setDesc] = useState(editing?.description ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>(editing?.members.map((m) => m.id) ?? []);

  // **editing は react-query（useQuery(['project-group-detail', id])）由来**で、
  // ダイアログを開いたまま裏で（他のタブ・別の操作の invalidate で）再フェッチされうる。
  // props → state のコピーが初期値だけだと、開いたあとの更新に追随できず、
  // 古い内容のまま保存して直前の変更を巻き戻してしまう
  useEffect(() => {
    setName(editing?.name ?? '');
    setDesc(editing?.description ?? '');
    setSelectedIds(editing?.members.map((m) => m.id) ?? []);
  }, [editing]);

  const { data } = useQuery({
    queryKey: ['gls-projects-for-groups'],
    queryFn: async () => (await api.get('/projects/gls-projects')).data,
  });
  const glsProjects: GlsProject[] = data?.data ?? [];

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name, description: desc, member_project_ids: selectedIds };
      return editing
        ? (await api.put(`/project-groups/${editing.id}`, payload)).data
        : (await api.post('/project-groups', payload)).data;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['project-groups'] });
      qc.invalidateQueries({ queryKey: ['project-group-detail'] });
      notifySuccess(editing ? '按分グループを更新しました' : '按分グループを追加しました');
      onSaved(result.data.id);
    },
    onError: (err) => notifyApiError('按分グループを保存できませんでした', err, '入力内容を確かめて、もう一度お試しください。'),
  });

  /** 保存できるか。Enter 送信とボタンの `disabled` で**同じ条件**を使う */
  const canSave = !!name && selectedIds.length >= 2 && !saveMutation.isPending;

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={editing ? '按分グループを編集' : '按分グループを追加'}
      // **Enter で保存**（`formDialog.tsx`）。保存ボタンは `type="submit"` にして
      // `onClick` を外す（両方あると二重送信になる）。`<form>` の中に入る他の
      // ボタンには必ず `type="button"` を付けること
      onSubmit={(e) => { e.preventDefault(); if (canSave) saveMutation.mutate(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
          <Button type="submit" disabled={!canSave}>
            {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {editing ? '更新' : '作成'}
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>グループ名 *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: GH 2026年度 IR関連" />
        </div>
        {/*
          **必須の2つ（グループ名・所属案件）を続けて置く。**
          間に任意の説明を挟むと、そこで手が止まります
          （`docs/design/v4/_form-order.md`「必須の欄の間に任意の欄を挟まない」）。
          所属案件は 288px のスクロール枠なので、下に置くほど飛ばされやすくもあります。
        */}
        <div>
          <Label>所属案件 *（2案件以上）</Label>
          <div className="mt-1 max-h-72 space-y-1.5 overflow-y-auto rounded-note border border-border p-2">
            {glsProjects.length === 0 ? (
              <p className="text-sub text-muted-foreground">GLS発番済み案件がありません</p>
            ) : (
              glsProjects.map((p) => (
                <ToggleCard
                  key={p.id}
                  selected={selectedIds.includes(p.id)}
                  onToggle={() => toggleMember(p.id)}
                  label={
                    <span>
                      <span className={selectedIds.includes(p.id) ? 'mr-1' : 'mr-1 text-primary'}>{p.gls_number}</span>
                      {p.name}
                    </span>
                  }
                  rightSlot={
                    // **`ToggleCard` は選択中の背景を inline style で当てる**（`bg-primary` クラスではない）。
                    // トークン（`text-primary-foreground`）だと検査が地の色を見つけられず
                    // 「塗りの無いところに塗りの上の文字色」と誤検知する。`description` と同じ
                    // `text-white` に揃える（部品側の既定と同じ書き方）
                    <span className={selectedIds.includes(p.id) ? 'text-[11px] text-white/80' : 'text-[11px] text-muted-foreground'}>
                      {p.customer_name}
                    </span>
                  }
                  size="sm"
                />
              ))
            )}
          </div>
          {selectedIds.length > 0 && <p className="text-note mt-1 text-muted-foreground">{selectedIds.length}案件選択中</p>}
        </div>
        {/* 説明は任意なので最後（`_form-order.md` の段6「補足」） */}
        <div>
          <Label>説明</Label>
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="グループの目的・対象案件の説明" rows={2} />
        </div>
      </div>
    </FormDialog>
  );
}
