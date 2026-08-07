/**
 * チケットにする（⑤ 入ってきた情報・v4 大②）
 *
 * ── 「チケット」は案件管理のタスクそのもの ─────────────────
 *
 * モックの文言どおり、押すと **`project_tasks` に1本作られます**。
 * 案件に紐づかない仕事なので `project_id` は空のまま（migration 135 で NULL 可）、
 * 由来（`source='inquiry'` / `source_ref=<この情報の id>`）を残すので、
 * タスクの側から元の中身へ戻れます。
 *
 * ── 件名と担当を訊く理由 ───────────────────────────────
 *
 * 黙って作ると「AI の要約がそのままタスク名」「作った人が担当」になります。
 * 要約は要件の説明であってやることではない（「◯◯の相談」と書かれても
 * 何をすればいいか分からない）ので、**やることの形に直してもらいます**。
 * 初期値は AI の推奨アクション → 無ければ要約。
 */
import { useState } from 'react';
import { Loader2, ListChecks } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useOnairUsers } from '@/lib/securityCardApi';
import { useMakeTicket } from '@/lib/inboxApi';
import type { MiscInquiry } from '@/lib/types';

export function TicketDialog({ inquiry, onClose }: { inquiry: MiscInquiry; onClose: () => void }) {
  const users = useOnairUsers();
  const make = useMakeTicket();
  const [title, setTitle] = useState(inquiry.action_needed?.trim() || inquiry.summary);
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');

  const submit = () => {
    make.mutate(
      {
        id: inquiry.id,
        fields: {
          title: title.trim(),
          assigned_to: assignee || undefined,
          // 期限は日付だけ訊いて 18:00 に置く。タスクの期限は分まで持つ列だが、
          // ここで時刻まで詰めても運用されない（`docs/wording.md` の例外は明示する）
          due_at: due ? `${due}T18:00:00` : null,
        },
      },
      {
        onSuccess: (r) => {
          notifySuccess(r.already
            ? 'すでにチケットになっていました（増やしていません）'
            : 'チケットにしました。案件管理のタスク一覧に出ます');
          onClose();
        },
        onError: (e) => notifyApiError('チケットにできませんでした', e),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>チケットにする</DialogTitle>
          <DialogDescription>
            <strong className="font-bold">案件管理のタスクが1本できます。</strong>
            案件には紐づきません（この用件は案件の外の仕事なのでここに来ています）。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label>やること *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="UPSの更新見積を取る"
            />
            <p className="text-note mt-1 text-muted-foreground">
              要約のままではなく<strong className="font-bold">やることの形</strong>に直してください。
              タスク一覧にはこの文字だけが並びます。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>担当</Label>
              <Select value={assignee || 'me'} onValueChange={(v) => setAssignee(v === 'me' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">自分</SelectItem>
                  {(users.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>期限</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>

          <div className="rounded-control-lg border border-border bg-surface-subtle p-3">
            <p className="text-note text-muted-foreground">元の情報</p>
            <p className="text-sub mt-0.5">{inquiry.summary}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button onClick={submit} disabled={make.isPending || !title.trim()}>
            {make.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <ListChecks className="mr-2 h-4 w-4" aria-hidden="true" />}
            チケットにする
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
