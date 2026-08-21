/**
 * 文面を見る／直す（v4 設定 ⑦）
 *
 * ── 社外あては「コピーする」画面 ────────────────────────────
 *
 * 送信の経路を作らないと決めたので（ご判断）、この画面の役目は
 * **文面をそのままコピーして持っていけること**です。件名と本文を
 * 別々にコピーできるようにしてあります（メールソフトの欄が別なので）。
 *
 * ── 差し込み語は埋めない ────────────────────────────────────
 *
 * `{案件名}` のままコピーします。ここで空にすると「・金額：」のような
 * 欠けた行になり、**値が 0 円なのか差し込み漏れなのか読み手に分かりません**。
 * 何を差し替えるかが見えている状態で渡すほうが安全です。
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { Template } from './notifyTypes';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="text-note min-h-tap rounded-note inline-flex items-center gap-1 border border-border bg-card px-2.5 font-bold text-muted-foreground lg:min-h-[32px]"
    >
      {done
        ? <><Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />コピーしました</>
        : <><Copy className="h-3.5 w-3.5" aria-hidden="true" />{label}</>}
    </button>
  );
}

interface Props {
  template: Template;
  canEdit: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TemplateDialog({ template, canEdit, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [enabled, setEnabled] = useState(template.enabled);

  useEffect(() => {
    if (!open) return;
    setSubject(template.subject);
    setBody(template.body);
    setEnabled(template.enabled);
  }, [open, template]);

  const external = template.audience === 'external';

  const save = useMutation({
    mutationFn: async () => api.put(`/notifications/templates/${template.id}`, {
      subject, body, ...(external ? {} : { enabled }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notify-templates'] });
      notifySuccess('文面を保存しました');
      onOpenChange(false);
    },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  const dirty = subject !== template.subject || body !== template.body || enabled !== template.enabled;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={template.name}
      sub={`${template.trigger} ／ 宛先：${template.send_to}`}
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>閉じる</Button>
          {canEdit && (
            <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              保存する
            </Button>
          )}
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        {external && (
          <p className="rounded-note text-note border border-warning-border bg-warning-surface px-3.5 py-3 text-secondary-foreground">
            <strong className="font-bold">この文面は ONAiR からは送りません。</strong>
            下のボタンでコピーして、いつもの方法で送ってください。
            <strong className="font-bold">{'{'}案件名{'}'} のような語はそのまま残しています</strong> —
            空にすると、値が 0 なのか差し替え漏れなのか分からなくなるためです。
          </p>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="tpl-subject" className="flex-1">件名</Label>
              <CopyButton text={subject} label="件名をコピー" />
            </div>
            <Input
              id="tpl-subject"
              className="mt-1.5"
              value={subject}
              readOnly={!canEdit}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="tpl-body" className="flex-1">本文</Label>
              <CopyButton text={body} label="本文をコピー" />
            </div>
            <textarea
              id="tpl-body"
              className="rounded-control text-sub mt-1.5 min-h-[200px] w-full border border-border bg-card px-3 py-2 leading-relaxed"
              value={body}
              readOnly={!canEdit}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {template.vars.length > 0 && (
            <div>
              <Label>差し込み語</Label>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {template.vars.map((v) => (
                  <span key={v} className="rounded-note text-note bg-surface-subtle px-2 py-0.5 text-muted-foreground">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!external && canEdit && (
            <label className="rounded-note flex cursor-pointer items-start gap-2.5 border border-border bg-surface-subtle px-3.5 py-3">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="text-note">
                この通知を出す
                <span className="mt-0.5 block text-muted-foreground">
                  外すと、定時実行がこの通知を作らなくなります（すでに出したものは残ります）。
                </span>
              </span>
            </label>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
