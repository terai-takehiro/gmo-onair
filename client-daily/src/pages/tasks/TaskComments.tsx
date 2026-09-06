// ══════════════════════════════════════════════════
// 依頼のコメントスレッド (Phase 2 ⑤)
// ══════════════════════════════════════════════════
//
// これまで受け手の返答メモは description に追記されて「依頼文とやり取りが
// 混ざる」形だった。サーバー側は task_comments テーブルに移してあり
// (GET/POST /dailyops/tasks/:id/comments)、ここはその画面側。
//
// 読み書きできるのは**当事者（依頼主・受け手・作成者）だけ** — サーバーが
// 403 で守っている。この画面（受けた依頼・出した依頼）に並ぶのは自分が
// 当事者の依頼だけなので、他人の依頼に入力欄が出ることはない。
//
// フックを lib/tasksApi.ts に置かずここに置いているのは、コメントを使うのが
// 依頼の行だけで、一覧の型やヘルパーと違い他の画面から呼ばれないため。

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { formatDue } from '@/lib/tasksApi';

interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

export function TaskCommentsThread({ taskId, canWrite }: {
  taskId: string;
  /** 書けるか（dailyops editor 以上）。reader には一覧だけ出す */
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');

  // **開いてから取りに行く。** 依頼一覧の行ぜんぶで先読みすると、
  // 開きもしないスレッドの分だけリクエストが並ぶ
  const list = useQuery({
    queryKey: ['task-comments', taskId],
    enabled: open,
    queryFn: async () =>
      (await api.get(`/dailyops/tasks/${taskId}/comments`)).data.data as TaskComment[],
  });

  const add = useMutation({
    mutationFn: (text: string) =>
      api.post(`/dailyops/tasks/${taskId}/comments`, { body: text }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['task-comments', taskId] });
      // 返答メモもこの表に入るようになったので、依頼一覧側も読み直す
      qc.invalidateQueries({ queryKey: ['my-delegations'] });
    },
    onError: (e) => notifyApiError('コメントを送れませんでした', e),
  });

  // サーバーは古い順で返す。この欄は**新しい順**（最新のやり取りを先に見せる）
  const rows = [...(list.data ?? [])].reverse();

  return (
    <div className="mt-2 border-t border-border pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-tap lg:min-h-0 flex items-center gap-1 text-xs font-bold text-primary hover:underline"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
        コメント
        {list.data && <span className="text-muted-foreground">{list.data.length}</span>}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {canWrite && (
            <div className="space-y-1.5">
              <Textarea
                rows={2}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="例: 期限を1日ずらせますか"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  disabled={add.isPending || !body.trim()}
                  onClick={() => add.mutate(body.trim())}
                >
                  {add.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
                  送る
                </Button>
                {/* 黙って通知が飛ぶと「見られていると思わなかった」になる。先に書く */}
                <span className="text-note text-muted-foreground">送ると相手に通知が届きます</span>
              </div>
            </div>
          )}

          {list.isLoading ? (
            <p className="text-sub-sm flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />読み込み中…
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sub-sm text-muted-foreground">まだコメントはありません。</p>
          ) : (
            <ul className="space-y-1.5">
              {rows.map((c) => {
                const mine = c.author_id === currentUser?.id;
                return (
                  <li
                    key={c.id}
                    className={cn(
                      'max-w-[85%] rounded-lg px-2.5 py-1.5',
                      // 自分の発言は右寄せ＋色で分ける（吹き出しまでは作らない）
                      mine ? 'ml-auto bg-primary/10' : 'bg-muted/60',
                    )}
                  >
                    <p className="text-note text-muted-foreground">
                      {mine ? '自分' : (c.author_name ?? '（不明）')} ・ {formatDue(c.created_at)}
                    </p>
                    <p className="text-sub whitespace-pre-wrap">{c.body}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
