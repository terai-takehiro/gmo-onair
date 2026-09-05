// 計時・視聴者（liveops）— テンプレートライブラリの3つのダイアログ（v4.1・PR3）。
// 「現在のレイアウトを保存」「適用」「削除」— いずれも manager 限定の操作。
// `LiveDisplayTemplateLibraryPage.tsx` から呼ぶ（400行基準に収めるための分割。
// `LiveOrgSettingsPage.tsx` を節ごとに分けた既存パターンと同じ考え方）。
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { notifyError, notifySuccess } from '@/lib/notify';
import type { DisplayLayout } from '@gmo-onair/shared/src/client/live/displayLayout';
import type { TemplateRow } from './displayTemplateTypes';

export function SaveCurrentTemplateDialog({ open, onOpenChange, layout, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: DisplayLayout | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');

  const saveMutation = useMutation({
    mutationFn: () => api.post('/liveops/display-templates', { name, layout }),
    onSuccess: () => {
      notifySuccess('テンプレートを保存しました');
      setName('');
      onOpenChange(false);
      onSaved();
    },
    onError: () => notifyError('保存できませんでした。', { description: '少し待ってから、もう一度お試しください。' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>現在のレイアウトをテンプレートとして保存</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-display-template-name">テンプレート名</Label>
            <Input
              id="new-display-template-name" placeholder="例: 標準（タイマー中央）" value={name} autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name && layout) saveMutation.mutate(); }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!name || !layout || saveMutation.isPending}>保存</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TimerOption { id: string; name: string; project_name?: string | null }

export function ApplyTemplateDialog({ template, defaultTimerId, onOpenChange, onApplied }: {
  template: TemplateRow | null;
  defaultTimerId: string | null;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const open = !!template;
  const [timerId, setTimerId] = useState(defaultTimerId ?? '');

  useEffect(() => {
    // template が変わる（別カードの「適用」を押した）たびに既定値を引き直す
    if (open) setTimerId(defaultTimerId ?? '');
  }, [open, defaultTimerId, template?.id]);

  const timersQuery = useQuery({
    queryKey: ['display-templates-apply-timers'],
    queryFn: () => api.get('/liveops/timers').then((r) => r.data.data as TimerOption[]),
    enabled: open,
  });

  const applyMutation = useMutation({
    mutationFn: () => api.post(`/liveops/display-templates/${template!.id}/apply`, { timerId }),
    onSuccess: () => {
      notifySuccess('テンプレートを適用しました');
      onOpenChange(false);
      onApplied();
    },
    onError: () => notifyError('適用できませんでした。', { description: '少し待ってから、もう一度お試しください。' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>「{template?.name}」を適用</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            選んだタイマーの表示レイアウトへコピーされます。以後このテンプレート側を変えても、適用したタイマーの表示には影響しません。
          </p>
          <div className="space-y-1.5">
            <Label>適用先のタイマー</Label>
            <Select value={timerId} onValueChange={setTimerId}>
              <SelectTrigger><SelectValue placeholder="タイマーを選択" /></SelectTrigger>
              <SelectContent>
                {(timersQuery.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.project_name ? `${t.project_name} ／ ${t.name}` : t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
            <Button onClick={() => applyMutation.mutate()} disabled={!timerId || applyMutation.isPending}>適用</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteTemplateDialog({ template, onOpenChange, onConfirm, pending }: {
  template: TemplateRow | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const open = !!template;
  const usageCount = template ? Number(template.usage_count) || 0 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>「{template?.name}」を削除しますか？</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {usageCount > 0
              ? `適用済みのタイマー${usageCount}件の表示は変わりません（ラベルが消えるだけです）。`
              : 'このテンプレートを適用したタイマーはいまのところありません。'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
            <Button variant="destructive" onClick={onConfirm} disabled={pending}>削除する</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
