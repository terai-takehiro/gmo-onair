/**
 * 依頼する — **依頼タブの主操作**
 *
 * ── なぜ専用のダイアログを作ったか ──────────────────────────
 *
 * 作り直す前、依頼タブには依頼を作る操作が**1つもありませんでした**。
 * 手で1件出す唯一の道は マイタスク タブの `追加` を開いて担当者を自分以外に
 * 変えることで、**選ぶまでそれが依頼になると分からない**形でした
 * （投入口を AI に寄せた結果・要件 D4）。依頼の画面の主操作は「依頼する」です。
 *
 * ── 欄の並び ────────────────────────────────────────────────
 *
 *   誰に → 依頼の内容 → 補足 → 期限 → 重要度・緊急度 → 判定
 *
 * **誰に、をいちばん上に置く**のは、この欄で期限が必須に変わるため
 * （`docs/design/v4/_form-order.md` 2-1「依存する欄は依存される欄より下」）。
 * 期限は依頼では必ず要ります（要件 D9。「いつまでに」の無い依頼は指示として
 * 成立していない）。重要度・緊急度は**頼む側が示す**（要件 D2）。
 */
import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { fromLocalInput, useAssignees, useCreateTask } from '@/lib/tasksApi';
import { DueField, LevelPicker, PriorityPreview } from './TaskFields';

export function RequestDialog({ assignee: initialAssignee, onClose }: {
  /** チームタブの「この人に依頼する」から開いたときの相手 */
  assignee?: string;
  onClose: () => void;
}) {
  const create = useCreateTask();
  const { currentUser } = useAuth();
  const { data: users } = useAssignees();
  const [assignee, setAssignee] = useState(initialAssignee ?? '');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [due, setDue] = useState('');
  const [imp, setImp] = useState(2);
  const [urg, setUrg] = useState(2);
  const [err, setErr] = useState<string | null>(null);

  const others = (users ?? []).filter((u) => u.id !== currentUser?.id);
  const assigneeName = others.find((u) => u.id === assignee)?.name;
  /**
   * **相手がいないことを黙って出さない。** 日常業務の権限を持つ人が自分だけだと
   * 選択肢が「選んでください」の1行になり、**何を選べば送れるのか分からないまま**
   * 送信で弾かれる。理由と次の一手をその場に書く。
   */
  const noOthers = !!users && others.length === 0;

  const submit = () => {
    setErr(null);
    if (!assignee) { setErr('依頼する相手を選んでください'); return; }
    if (!title.trim()) { setErr('依頼の内容を入力してください'); return; }
    if (!due) { setErr('依頼の期限は必須です。何月何日何時何分までかを入れてください'); return; }
    create.mutate(
      {
        title: title.trim(),
        description: desc.trim() || null,
        assigned_to: assignee,
        due_at: fromLocalInput(due),
        importance: imp,
        urgency: urg,
      },
      {
        onSuccess: onClose,
        onError: (e) => setErr(
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? '依頼を登録できませんでした。少し待ってから、もう一度お試しください。',
        ),
      },
    );
  };

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title="依頼する"
      sub="相手・内容・期限を決めて送ります。相手は 承諾 ／ 相談 ／ 辞退 を選べます。"
      onSubmit={(e) => { e.preventDefault(); if (!create.isPending) submit(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
          <Button type="submit" disabled={create.isPending || noOthers}>
            {create.isPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            依頼する
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-3">
        {err && <p className="text-sub rounded-note bg-destructive-surface px-2 py-1.5 text-destructive">{err}</p>}

        <div>
          <Label className="text-th">誰に <span className="text-destructive">*</span></Label>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="min-h-tap text-sub mt-1 w-full rounded-control border border-input bg-background px-2 lg:min-h-[40px]"
          >
            <option value="">選んでください</option>
            {others.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {/* 自分あては依頼ではない。**この画面には出さない**（マイタスクの「タスクを追加」が受け持つ） */}
          <p className={cn('text-note mt-1', noOthers ? 'text-destructive' : 'text-muted-foreground')}>
            {noOthers
              ? '依頼できる相手がいません。日常業務の権限を持つ人を「設定 ＞ 権限」で追加してください。'
              : '自分でやることは「マイタスク」の「タスクを追加」から登録してください。'}
          </p>
        </div>

        <div>
          <Label className="text-th">依頼の内容 <span className="text-destructive">*</span></Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1"
            placeholder="例: 10月内覧会の配信構成図をつくる"
          />
        </div>

        <div>
          <Label className="text-th">補足</Label>
          <Textarea
            rows={3}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="mt-1"
            placeholder="前回のファイルの場所、決まっている条件、判断してほしい点"
          />
        </div>

        <DueField value={due} onChange={setDue} required />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LevelPicker label="重要度" value={imp} onChange={setImp} />
          <LevelPicker label="緊急度" value={urg} onChange={setUrg} />
        </div>

        <PriorityPreview
          importance={imp}
          urgency={urg}
          hasDue={!!due}
          dueRequired
          note={assigneeName ? `${assigneeName} さんの一覧ではこの優先度で並びます` : undefined}
        />
      </div>
    </FormDialog>
  );
}
