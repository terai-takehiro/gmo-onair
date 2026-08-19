/**
 * 按分グループの作成・編集ダイアログ (v4)
 *
 * **メンバーは2案件以上**（`disabled` の条件）。1件だけでは按分にならない。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ToggleCard } from '@gmo-onair/shared/src/client/ui/toggle-button-group';
import type { GlsProject, GroupDetail } from './types';

export function GroupFormDialog({
  editing, onClose, onSaved,
}: {
  /** 直すグループ。`null` なら新規 */
  editing: GroupDetail | null;
  onClose: () => void;
  onSaved: (groupId: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? '');
  const [desc, setDesc] = useState(editing?.description ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>(editing?.members.map((m) => m.id) ?? []);

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
      notifySuccess(editing ? 'グループを更新しました' : 'グループを作成しました');
      onSaved(result.data.id);
    },
    onError: (err) => notifyApiError('グループの保存に失敗しました', err),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'グループ編集' : '新規グループ（費用を分け合う）'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>グループ名 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: GH 2026年度 IR関連" />
          </div>
          <div>
            <Label>説明</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="グループの目的・対象案件の説明" rows={2} />
          </div>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!name || selectedIds.length < 2 || saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {editing ? '更新' : '作成'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
