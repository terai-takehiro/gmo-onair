/**
 * 返信の下書き (§4.4 / デザイン 5a)
 *
 * AIが作る → 人がここで直して**保存する** → コピーして自分のメールで送る → 「送った」を記録。
 *
 * **ONAiR はメールを送らない**。保存が送信だと誤解されると「送ったつもり」で
 * 誰にも届かないという一番悪い事故になるので、画面に必ず書く。
 *
 * 保存した本文は AI の改善に戻る (直した差分が教師データになる)。
 * 「何を直したか」を人に入力させない — サーバーが自動で差分を取る。
 * 理由の欄だけ任意で置く (必須にすると入力されず空になる)。
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2, Copy, Check, Send, Ban, RefreshCw } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ReplyRow {
  inquiry_id: string;
  ai_text: string | null;
  final_text: string | null;
  status: "draft" | "saved" | "sent" | "unused";
  sent_at: string | null;
  note: string | null;
  model: string | null;
  prompt_version: string | null;
  updated_at: string;
}

const STATUS_LABEL: Record<ReplyRow["status"], string> = {
  draft: "AIが作りました（未確認）",
  saved: "保存しました（まだ送っていません）",
  sent: "送ったと記録しました",
  unused: "使わなかったと記録しました",
};

export function InquiryReply({ inquiryId, editable }: { inquiryId: string; editable: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: reply, isLoading } = useQuery<ReplyRow | null>({
    queryKey: ["inquiry-reply", inquiryId],
    queryFn: async () => (await api.get(`/dailyops/inquiries/${inquiryId}/reply`)).data.data,
    refetchOnMount: "always",
  });

  // サーバーの値を編集欄に取り込む (人が直した分があればそちらを優先)
  useEffect(() => {
    if (!reply) return;
    setText(reply.final_text ?? reply.ai_text ?? "");
    setNote(reply.note ?? "");
  }, [reply?.final_text, reply?.ai_text, reply?.note, reply]);

  const fail = (e: unknown) => {
    const err = e as { response?: { data?: { error?: { message?: string } } } };
    setError(err?.response?.data?.error?.message ?? "うまくいきませんでした");
  };
  const done = () => {
    setError(null);
    qc.invalidateQueries({ queryKey: ["inquiry-reply", inquiryId] });
  };

  const draft = useMutation({
    mutationFn: async () => api.post(`/dailyops/inquiries/${inquiryId}/reply/draft`),
    onSuccess: done, onError: fail,
  });
  const save = useMutation({
    mutationFn: async () =>
      api.put(`/dailyops/inquiries/${inquiryId}/reply`, { final_text: text, note: note || null }),
    onSuccess: done, onError: fail,
  });
  const mark = useMutation({
    mutationFn: async (outcome: "sent" | "unused") =>
      api.post(`/dailyops/inquiries/${inquiryId}/reply/mark`, { outcome }),
    onSuccess: done, onError: fail,
  });

  const busy = draft.isPending || save.isPending || mark.isPending;
  const edited = !!reply?.ai_text && text.trim() !== reply.ai_text.trim();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("コピーできませんでした。本文を選んで手でコピーしてください。");
    }
  };

  if (isLoading) {
    return <p className="text-[13px] text-secondary-foreground">返信の下書きを読み込んでいます…</p>;
  }

  // まだ下書きが無い
  if (!reply) {
    return (
      <div className="rounded-control border border-ai-border bg-ai-surface px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-ai">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          返信の下書きをAIに作らせる
        </p>
        <p className="mt-0.5 text-[12px] text-secondary-foreground">
          作った下書きはここで直せます。<span className="font-bold">送信はONAiRからは行いません</span> —
          直した本文をコピーして、ご自分のメールで送ってください。
        </p>
        {editable ? (
          <Button size="sm" className="mt-2 h-9 gap-1.5" disabled={busy} onClick={() => draft.mutate()}>
            {draft.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            下書きを作る
          </Button>
        ) : (
          <p className="mt-1 text-[12px] text-secondary-foreground">
            作るには「日常業務」の書ける権限が必要です。
          </p>
        )}
        {error && <p className="mt-1.5 text-[12px] font-bold text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-control border border-ai-border bg-ai-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-ai">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          返信の下書き
        </p>
        <span className="rounded bg-card px-1.5 py-0.5 text-[11px] font-bold text-secondary-foreground">
          {STATUS_LABEL[reply.status]}
        </span>
        {edited && (
          <span className="rounded bg-warning-surface px-1.5 py-0.5 text-[11px] font-bold text-warning-strong">
            直しました（未保存）
          </span>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={9}
        readOnly={!editable}
        className="mt-2 w-full rounded-control border border-border bg-card px-3 py-2 text-[13px] leading-relaxed text-foreground"
        aria-label="返信の本文"
      />

      {editable && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="直した理由（任意・AIの改善に使います）"
          className="mt-1.5 w-full rounded-control border border-border bg-card px-3 py-1.5 text-[12px] text-foreground"
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={copy}>
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? "コピーしました" : "本文をコピー"}
        </Button>
        {editable && (
          <>
            <Button size="sm" className="h-9" disabled={busy || !text.trim()} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              保存する
            </Button>
            <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={busy} onClick={() => mark.mutate("sent")}>
              <Send className="h-4 w-4" aria-hidden="true" />
              送った
            </Button>
            <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={busy} onClick={() => mark.mutate("unused")}>
              <Ban className="h-4 w-4" aria-hidden="true" />
              使わなかった
            </Button>
            <Button
              size="sm" variant="outline" className="ml-auto h-9 gap-1.5" disabled={busy}
              onClick={() => {
                if (window.confirm("下書きを作り直します。いま直している本文は消えます。よろしいですか？")) {
                  draft.mutate();
                }
              }}
            >
              <RefreshCw className={cn("h-4 w-4", draft.isPending && "animate-spin")} aria-hidden="true" />
              作り直す
            </Button>
          </>
        )}
      </div>

      {error && <p className="mt-1.5 text-[12px] font-bold text-destructive">{error}</p>}

      <p className="mt-1.5 text-[12px] text-muted-foreground">
        <span className="font-bold">ONAiRはメールを送りません。</span>
        保存してから本文をコピーし、ご自分のメールで送ってください。送ったら「送った」を押してください
        （保存した本文と直した箇所は、次の下書きを良くするために使います）。
      </p>
    </div>
  );
}
