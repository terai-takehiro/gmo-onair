/**
 * お試し（練習が実績に混ざらない）— デザイン 25章
 *
 * ── 画面の決めごと ──────────────────────────────────────
 *
 *  - **道具は本物と同じもの**に入る（練習用の画面を別に作らない。
 *    別に作ると練習で通った道と本番で通る道が違うので練習の意味が無くなる）
 *  - **できないことを先に書く**（予約・タイマー・GLS・BOX・請求書）。
 *    黙っていると押して失敗して理由が分からない
 *  - **本物にはできない**とはっきり書く
 *  - 片づけるのは人が押す。**自動で消さない**
 *    （作りかけの練習が朝には消えていた、が起きる）
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FlaskConical, Plus, Trash2, ChevronRight, Ban, Clock, AlertTriangle,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorPanel, SkeletonCard } from '@gmo-onair/shared/src/client/states';

interface SandboxItem {
  id: string;
  name: string;
  created_at: string;
  days_old: number;
  stale: boolean;
  event_start: string | null;
  tried: string[];
}
interface Tool { key: string; label: string; what: string; path: string }
interface Blocked { key: string; label: string; why: string }
interface SandboxList {
  items: SandboxItem[];
  stale_days: number;
  tools: Tool[];
  blocked: Blocked[];
  cannot_promote: string;
}

export default function SandboxPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sandbox"],
    queryFn: async () => (await api.get("/projects/sandbox")).data.data as SandboxList,
  });

  const start = useMutation({
    mutationFn: async () => (await api.post("/projects/sandbox", {})).data.data as { id: string },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["sandbox"] });
      if (r?.id) navigate(`/sales/projects/${r.id}`);
    },
  });

  const cleanup = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/projects/sandbox/${id}`)).data,
    onSuccess: () => {
      setConfirmId(null);
      qc.invalidateQueries({ queryKey: ["sandbox"] });
    },
  });

  if (isLoading) return <div className="p-4 sm:p-6"><SkeletonCard lines={4} /></div>;
  if (error) return <div className="p-4 sm:p-6"><ErrorPanel title="お試しを読めませんでした" error={error} /></div>;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-lg font-bold">
        <FlaskConical className="h-5 w-5" aria-hidden="true" />
        お試し（練習）
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        本物の案件を作らずに道具を試せます。
        <strong className="text-foreground">練習で入れた数字は、売上・粗利・月次・案件一覧に入りません。</strong>
      </p>

      {/* 何が試せるか */}
      <section className="mt-4 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-bold">試せるもの</h2>
        <ul className="mt-2 space-y-1.5">
          {data.tools.map((t) => (
            <li key={t.key} className="text-sm">
              <span className="font-bold">{t.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">{t.what}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          <strong className="text-foreground">道具は本物と同じ画面です。</strong>
          練習用の別の画面ではないので、覚えたことがそのまま本番で使えます。
        </p>
      </section>

      {/* できないこと */}
      <section className="mt-3 rounded-xl border bg-muted/30 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-bold">
          <Ban className="h-4 w-4" aria-hidden="true" />
          お試しではできないこと
        </h2>
        <ul className="mt-2 space-y-1.5">
          {data.blocked.map((b) => (
            <li key={b.key} className="text-sm">
              <span className="font-bold">{b.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">{b.why}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {data.cannot_promote}
        </p>
      </section>

      {/* はじめる */}
      <button
        onClick={() => start.mutate()}
        disabled={start.isPending}
        className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50 hover:opacity-90 sm:w-auto"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {start.isPending ? "作っています…" : "お試しをはじめる"}
      </button>
      {start.isError && (
        <p className="mt-2 text-xs text-destructive">
          お試しを作れませんでした。もう一度お試しください。
        </p>
      )}

      {/* いまあるお試し */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold">いまあるお試し</h2>
        {data.items.length === 0 ? (
          <EmptyState
            icon={<FlaskConical className="h-6 w-6" />}
            title="お試しはまだありません"
            description="「お試しをはじめる」を押すと、日程とメンバーが入った練習用の案件ができます。"
          />
        ) : (
          <ul className="space-y-2">
            {data.items.map((it) => (
              <li key={it.id} className={cn(
                "rounded-xl border bg-card p-3",
                it.stale && "border-amber-300 bg-amber-50/40",
              )}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                    お試し
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{it.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {it.days_old === 0 ? "今日" : `${it.days_old}日前`}
                  </span>
                </div>
                {it.tried.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    試したもの: {it.tried.join(" ・ ")}
                  </p>
                )}
                {it.stale && (
                  <p className="mt-1 text-xs text-amber-900">
                    {data.stale_days}日以上前のお試しです。使い終わっていれば片づけてください。
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => navigate(`/sales/projects/${it.id}`)}
                    className="flex min-h-[44px] items-center gap-1 rounded-lg border px-3 text-xs hover:bg-muted">
                    ひらく
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  {confirmId === it.id ? (
                    <>
                      <button onClick={() => cleanup.mutate(it.id)}
                        disabled={cleanup.isPending}
                        className="min-h-[44px] rounded-lg bg-destructive px-3 text-xs font-bold text-destructive-foreground disabled:opacity-50">
                        {cleanup.isPending ? "片づけています…" : "本当に片づける"}
                      </button>
                      <button onClick={() => setConfirmId(null)}
                        className="min-h-[44px] rounded-lg border px-3 text-xs hover:bg-muted">
                        やめる
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmId(it.id)}
                      className="flex min-h-[44px] items-center gap-1 rounded-lg border px-3 text-xs text-muted-foreground hover:bg-muted">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      片づける
                    </button>
                  )}
                </div>
                {confirmId === it.id && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    練習で作った見積・香盤表・運営マニュアルもいっしょに消えます。戻せません。
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
