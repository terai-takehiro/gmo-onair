// ④壁打ち（対話）— 段8・04-ai.md §4・§14-8。**本人のみ**（チーム共有はしない）。
//
// 1往復 = 1 POST（ストリーミングしない・§4-3）。入力欄は BufferedTextarea
// （IME の変換中に文字が消える地雷を避けるため。CLAUDE.md の qsheet 固有ルール）。
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import BufferedTextarea from "@/components/editor/cells/BufferedTextarea";
import {
  createThread, getThread, postThreadMessage, setMessageFeedback, type AiMessage, type AiThread,
} from "@/lib/aiApi";
import { notifyError } from "@/lib/notify";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId?: string;
  scheduleId?: string;
  documentId?: string;
  /** assistant の発言に suggestion が付いたとき、次段を起動できるようにする */
  onSuggest?: (suggests: string, hint: string) => void;
}

export default function AiChatSheet({ open, onOpenChange, projectId, scheduleId, documentId, onSuggest }: Props) {
  const [thread, setThread] = useState<AiThread | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [sending, setSending] = useState(false);
  const draftRef = useRef("");
  const [draftEmpty, setDraftEmpty] = useState(true);

  useEffect(() => {
    if (!open || thread) return;
    void createThread({ projectId, scheduleId, documentId }).then((t) => {
      setThread(t);
      setMessages([]);
    }).catch((e) => notifyError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSend() {
    const content = draftRef.current.trim();
    if (!content || !thread || sending) return;
    setSending(true);
    draftRef.current = "";
    setDraftEmpty(true);
    setMessages((prev) => [...prev, { id: "tmp-" + Date.now(), seq: 0, role: "user", content, suggestion: null, feedback: null, spawned_proposal_id: null }]);
    try {
      const result = await postThreadMessage(thread.id, content);
      const full = await getThread(thread.id);
      setMessages(full.messages);
      if (result.assistant.suggestion && onSuggest) {
        onSuggest(result.assistant.suggestion.suggests, result.assistant.suggestion.hint);
      }
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function handleFeedback(messageId: string, feedback: "good" | "rephrase" | "reject") {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)));
    await setMessageFeedback(messageId, feedback).catch(() => {});
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // **会話ログなので `md`（640px）。** 中身は吹き出しが縦に積まれるだけの1カラムで、
        // 2列に並べる入力も横に広げる表も無い。`lg`（840px）にすると 1 行が 700px 超に
        // なり、読むのに目を左右へ振ることになる（長文の可読性は 1 行 40〜50 字が上限）。
        // ⚠️ 旧実装が指していた Tailwind の最大幅の `lg` 段は **512px** で、この段の
        // `lg`（840px）とは別物。名前が同じなだけなので取り違えないこと
        // （512px は狭すぎたので戻さず、1段だけ広い `md`=640px にした）。
        size="md"
        className="flex flex-col"
      >
        <DialogHeader>
          <DialogTitle>AI に相談（あなただけに見えます）</DialogTitle>
        </DialogHeader>
        <div className="flex-1 max-h-[55vh] overflow-y-auto space-y-3 py-2">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
              <div className={`inline-block rounded-md px-3 py-2 text-sm max-w-[85%] ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {m.content}
              </div>
              {m.role === "assistant" && (
                <div className="mt-1 flex items-center gap-3 text-sub text-muted-foreground">
                  <button type="button" className="h-11 min-w-[44px]" onClick={() => handleFeedback(m.id, "good")} aria-label="役に立った">
                    {m.feedback === "good" ? "👍済" : "👍"}
                  </button>
                  <button type="button" className="h-11 min-w-[44px]" onClick={() => handleFeedback(m.id, "rephrase")} aria-label="言い直して">
                    {m.feedback === "rephrase" ? "✏️済" : "✏️"}
                  </button>
                  <button type="button" className="h-11 min-w-[44px]" onClick={() => handleFeedback(m.id, "reject")} aria-label="的外れ">
                    {m.feedback === "reject" ? "❌済" : "❌"}
                  </button>
                  {m.suggestion && onSuggest && (
                    <Button size="sm" variant="outline" onClick={() => onSuggest(m.suggestion!.suggests, m.suggestion!.hint)}>
                      この案から作る
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">何を作りたいか、まだ決まっていなくても大丈夫です。相談しながら整理しましょう。</p>
          )}
        </div>
        <div className="flex items-end gap-2 border-t border-border pt-2">
          <BufferedTextarea
            key={messages.length /* 送信後（messages が増える）に空欄へリセットする */}
            value=""
            onCommit={(v) => { draftRef.current = v; setDraftEmpty(v.trim() === ""); }}
            placeholder="メッセージを入力"
            className="flex-1 min-h-[44px] rounded-md border border-input bg-background p-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing) {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
                setTimeout(handleSend, 0);
              }
            }}
          />
          <Button onClick={handleSend} disabled={sending || draftEmpty} className="min-h-[44px]">
            {sending ? "…" : "送る"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function errorMessage(e: unknown): string {
  const err = e as { response?: { status?: number; data?: { error?: { message?: string } } } };
  if (err?.response?.status === 503) return "いまは AI を使えません。手動で作成できます。";
  return err?.response?.data?.error?.message ?? "AI に相談できませんでした。少し待ってから、もう一度お試しください。";
}
