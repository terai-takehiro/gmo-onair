/**
 * 標準工程テンプレートを作る／直す（⑦）
 *
 * ── 直すと動いているプロジェクトはどうなるか ────────────────
 *
 * **変わりません。** 展開は「写す」なので、直した内容は**次に作るぶんから**
 * 効きます。ここを書いておかないと「ひな形を直せば全部直る」と思われ、
 * 直したのに現場の工程表が変わらない、という誤解になります。
 * 適用中の件数をダイアログにも出して、影響の無さを見えるようにします。
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useInvalidateGpm } from '../../queries';
import type { GpmTemplate } from '../../types';
import { PhaseEditor } from './PhaseEditor';
import { draftDays, draftTasks, toBody, toDraft, type Draft } from './draft';

export function TemplateDialog({
  template, onClose,
}: {
  /** 直すとき。作るときは `null` */
  template: GpmTemplate | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidateGpm();
  const [draft, setDraft] = useState<Draft>(() => toDraft(template));

  const save = useMutation({
    mutationFn: () =>
      template
        ? api.put(`/gpm/templates/${template.id}`, toBody(draft))
        : api.post('/gpm/templates', toBody(draft)),
    onSuccess: () => {
      invalidate();
      notifySuccess(template ? 'ひな形を直しました' : 'ひな形を作りました', {
        description: template && template.used_count > 0
          ? `すでに適用済みの ${template.used_count} 件は変わりません（写して使うため）。次に作るぶんから効きます。`
          : undefined,
      });
      onClose();
    },
    onError: (err) => notifyApiError(template ? 'ひな形を直せませんでした' : 'ひな形を作れませんでした', err),
  });

  const phases = draft.phases.length;
  const tasks = draftTasks(draft);
  const days = draftDays(draft);

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={template ? 'ひな形を直す' : 'ひな形を作る'}
      wide
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button onClick={() => save.mutate()} disabled={!draft.name.trim() || save.isPending}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {template ? '直す' : '作る'}
          </Button>
        </FormDialogFooter>
      }
    >
        <div className="space-y-3">
          <div>
            <Label htmlFor="tpl-name">
              名前 <span className="text-destructive">必須</span>
            </Label>
            <Input
              id="tpl-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="施設AV設備 更新"
            />
          </div>
          <div>
            <Label htmlFor="tpl-desc">どんなときに使うか</Label>
            <Textarea
              id="tpl-desc"
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="稼働中の施設のオーディオビジュアル設備を入れ替えるとき"
            />
          </div>

          <div className="rounded-note flex flex-wrap gap-x-4 gap-y-1 bg-surface-subtle px-3 py-2">
            <span className="text-sub text-muted-foreground">
              工程 <span className="font-number text-foreground">{phases}</span>
            </span>
            <span className="text-sub text-muted-foreground">
              タスク <span className="font-number text-foreground">{tasks}</span>
            </span>
            <span className="text-sub text-muted-foreground">
              目安 <span className="font-number text-foreground">{days}</span>日
            </span>
            {template && template.used_count > 0 && (
              <span className="text-sub text-muted-foreground">
                適用中 <span className="font-number text-foreground">{template.used_count}</span>件
                （直しても変わりません）
              </span>
            )}
          </div>

          <PhaseEditor phases={draft.phases} onChange={(next) => setDraft({ ...draft, phases: next })} />
        </div>
    </FormDialog>
  );
}
