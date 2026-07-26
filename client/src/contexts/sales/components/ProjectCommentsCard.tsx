/**
 * 案件のコメントと「知らせる人」(B3)
 *
 * **「みんなで書くメモ」とは役割が違う**: メモはいまの状態を全員で書き直す場所で、
 * 後から誰が何を書いたかは残らない。こちらは**言った・言わないの記録**なので
 * 1件=1行で残し、書き換えない。
 *
 * 知らせる相手は**選ばせる**。本文から @名前 を機械的に拾うと、日本語の氏名は
 * 区切りが曖昧で取り違えたときに**別の人に知らせてしまう**。
 * 知らせるとその人のベルに出て、**その人が「対応した」を押すまで消えない**。
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Trash2, Bell, Check, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/platform/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

interface Mention {
  user_id: string;
  name: string | null;
  resolved_at: string | null;
}
interface Comment {
  id: string;
  body: string;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
  mentions: Mention[];
}

function when(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "いま";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ProjectCommentsCard({
  projectId,
  editable,
}: {
  projectId: string;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  const [body, setBody] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ["project-comments", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/comments`)).data.data,
    refetchOnMount: "always",
  });
  // 知らせる相手の候補 (営業を触れる人)
  const { data: people = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["users-by-module", "sales"],
    queryFn: async () => (await api.get("/users/by-module/sales")).data.data,
    enabled: editable,
  });

  const done = () => {
    setError(null);
    qc.invalidateQueries({ queryKey: ["project-comments", projectId] });
    // ベルは react-query ではなく自前のポーリング (2分) + 開いたときの取り直しなので、
    // ここから無効化はできない。知らせは最長2分で相手のベルに出る。
  };
  const fail = (e: unknown) => {
    const err = e as { response?: { data?: { error?: { message?: string } } } };
    setError(err?.response?.data?.error?.message ?? "うまくいきませんでした");
  };

  const post = useMutation({
    mutationFn: async () =>
      api.post(`/projects/${projectId}/comments`, { body, mention_user_ids: targets }),
    onSuccess: () => { setBody(""); setTargets([]); done(); },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/projects/comments/${id}`),
    onSuccess: done, onError: fail,
  });
  const resolve = useMutation({
    mutationFn: async (id: string) => api.post(`/projects/comments/${id}/resolve`),
    onSuccess: done, onError: fail,
  });

  const toggle = (id: string) =>
    setTargets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Card id="comments">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />
          コメント
          {comments.length > 0 && (
            <span className="text-[12px] font-normal text-muted-foreground">{comments.length} 件</span>
          )}
          <span className="ml-auto text-[12px] font-normal text-muted-foreground">
            消せるのは自分が書いたものだけ
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-[13px] text-secondary-foreground">読み込んでいます…</p>
        ) : comments.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            コメントはまだありません。
            {editable ? "相談したいことを書いて、知らせたい人を選ぶとその人のベルに出ます。" : ""}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {comments.map((c) => {
              const mine = c.mentions.find((m) => m.user_id === currentUser?.id && !m.resolved_at);
              return (
                <li
                  key={c.id}
                  className={cn(
                    "rounded-control border border-border bg-card px-3 py-2",
                    mine && "border-warning bg-warning-surface",
                  )}
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-bold text-foreground">
                      {c.author_name ?? "不明"}
                    </span>
                    <span className="text-[12px] text-muted-foreground">{when(c.created_at)}</span>
                    {c.mentions.length > 0 && (
                      <span className="flex items-center gap-1 text-[12px] text-secondary-foreground">
                        <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                        {c.mentions
                          .map((m) => `${m.name ?? "不明"}${m.resolved_at ? "（対応済み）" : ""}`)
                          .join(" / ")}
                      </span>
                    )}
                    {c.author_id === currentUser?.id && editable && (
                      <button
                        type="button"
                        onClick={async () => {
                          if ((await confirmAction({ title: "このコメントを消します。よろしいですか？", confirmLabel: '削除する', tone: 'danger' }))) remove.mutate(c.id);
                        }}
                        className="ml-auto rounded-control p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                        aria-label="このコメントを消す"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                    {c.body}
                  </p>
                  {/* 自分あての知らせは、ここで終わらせられる (読んだだけでは消えない) */}
                  {mine && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-9 gap-1.5"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate(c.id)}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      対応した（ベルから消す）
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {editable && (
          <div className="space-y-2 rounded-control border border-border bg-secondary/30 p-2.5">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="相談・申し送り・決まったことの経緯など（あとから消さずに残ります）"
              className="w-full rounded-control border border-border bg-card px-3 py-2 text-[13px] text-foreground"
              aria-label="コメント"
            />
            <div>
              <p className="mb-1 text-[12px] font-bold text-secondary-foreground">
                知らせる人（この人のベルに出ます）
              </p>
              <div className="flex flex-wrap gap-1.5">
                {people
                  .filter((u) => u.id !== currentUser?.id)
                  .map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggle(u.id)}
                      className={cn(
                        "min-h-[36px] rounded-full border px-3 py-1 text-[12px] font-bold transition-colors",
                        targets.includes(u.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-secondary-foreground hover:bg-secondary",
                      )}
                      aria-pressed={targets.includes(u.id)}
                    >
                      {u.name}
                    </button>
                  ))}
                {people.length <= 1 && (
                  <span className="text-[12px] text-muted-foreground">知らせられる人がいません</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-9 gap-1.5"
                disabled={post.isPending || !body.trim()}
                onClick={() => post.mutate()}
              >
                {post.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                コメントする
              </Button>
              <span className="text-[12px] text-muted-foreground">
                {targets.length > 0 ? `${targets.length}人に知らせます` : "知らせる人を選ばなければ、記録として残るだけです"}
              </span>
            </div>
          </div>
        )}

        {error && <p className="text-[12px] font-bold text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export default ProjectCommentsCard;
