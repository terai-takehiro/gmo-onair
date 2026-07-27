/**
 * SlackDigestPage — 朝の1通 (Slack) の配信設定 (§4.15)
 *
 * **1件 = 1回の投稿**。同じチャンネルを何本でも登録できるので
 * 「朝は今日の現場・夕方は終わったこと」のように時刻ごとに内容を変えられる。
 *
 * 全社チャンネルに出るものなので:
 *   - システム管理者だけが触れる (ルート側で `admin` を要求)
 *   - **送る前に本文を読める** (「本文を確認する」)。初回の事故を防ぐのはこれ
 *   - 金額のブロックを選んだときは**権限の外に出ることを画面に書く**
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Loader2, Plus, Trash2, Send, Eye, AlertTriangle, Clock } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

interface BlockDef { key: string; label: string; hint: string; money?: boolean }
interface Channel { id: string; name: string; is_private: boolean }
interface Meta {
  blocks: BlockDef[];
  slack_configured: boolean;
  channels: Channel[];
  channels_reason: string | null;
}
interface DmSettings {
  send_time: string;
  weekdays: string;
  enabled: boolean;
  last_sent_at: string | null;
  last_error: string | null;
}
interface Digest {
  id: string;
  label: string | null;
  channel: string;
  send_time: string;
  weekdays: string;
  blocks: string[];
  enabled: boolean;
  last_sent_at: string | null;
  last_error: string | null;
}

const WD = [
  { n: 1, label: "月" }, { n: 2, label: "火" }, { n: 3, label: "水" }, { n: 4, label: "木" },
  { n: 5, label: "金" }, { n: 6, label: "土" }, { n: 7, label: "日" },
];

type Draft = {
  id?: string;
  label: string;
  channel: string;
  send_time: string;
  weekdays: number[];
  blocks: string[];
  enabled: boolean;
};

const NEW_DRAFT: Draft = {
  label: "",
  channel: "",
  send_time: "06:00",
  weekdays: [1, 2, 3, 4, 5],
  blocks: ["onsite_today", "waiting", "due_today"],
  enabled: true,
};


export default function SlackDigestPage() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<{ key: string; text: string } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const { data: meta } = useQuery<Meta>({
    queryKey: ["slack-digests", "meta"],
    queryFn: async () => (await api.get("/settings/slack-digests/meta")).data.data,
    staleTime: 60_000,
  });
  const { data: dm } = useQuery<DmSettings>({
    queryKey: ["slack-dm"],
    queryFn: async () => (await api.get("/settings/slack-dm")).data.data,
    refetchOnMount: "always",
  });
  const [dmDraft, setDmDraft] = useState<{ send_time: string; weekdays: number[]; enabled: boolean } | null>(null);
  useEffect(() => {
    if (dm && !dmDraft) {
      setDmDraft({ send_time: dm.send_time, weekdays: dm.weekdays.split(",").map(Number), enabled: dm.enabled });
    }
  }, [dm, dmDraft]);

  const saveDm = useMutation({
    mutationFn: async () => (await api.put("/settings/slack-dm", dmDraft)).data.data,
    onSuccess: () => { setNotice({ kind: "ok", text: "個人へのDMの設定を保存しました" }); qc.invalidateQueries({ queryKey: ["slack-dm"] }); },
    onError: (e: unknown) => setNotice({ kind: "error", text: msg(e) }),
  });
  const dmPreview = useMutation({
    mutationFn: async () => (await api.post("/settings/slack-dm/preview")).data.data as { text: string; recipients: number },
    onSuccess: (r) => setPreview({ key: "dm", text: `${r.text}\n\n---\n今このあと送る相手: ${r.recipients}人（出すものが無い人には送りません）` }),
    onError: (e: unknown) => setNotice({ kind: "error", text: msg(e) }),
  });
  const dmSendNow = useMutation({
    mutationFn: async () => api.post("/settings/slack-dm/send-now"),
    onSuccess: () => setNotice({ kind: "ok", text: "自分に送りました。Slack を確認してください。" }),
    onError: (e: unknown) => setNotice({ kind: "error", text: msg(e) }),
  });

  const { data: list, isLoading, error, refetch } = useQuery<Digest[]>({
    queryKey: ["slack-digests"],
    queryFn: async () => (await api.get("/settings/slack-digests")).data.data,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!list) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const d of list) {
        if (!next[d.id]) {
          next[d.id] = {
            id: d.id, label: d.label ?? "", channel: d.channel, send_time: d.send_time,
            weekdays: d.weekdays.split(",").map(Number), blocks: d.blocks ?? [], enabled: d.enabled,
          };
        }
      }
      return next;
    });
  }, [list]);

  const blocks = useMemo(() => meta?.blocks ?? [], [meta?.blocks]);
  const moneyKeys = useMemo(() => new Set(blocks.filter((b) => b.money).map((b) => b.key)), [blocks]);

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = { ...d, weekdays: d.weekdays };
      return d.id
        ? (await api.put(`/settings/slack-digests/${d.id}`, body)).data.data
        : (await api.post("/settings/slack-digests", body)).data.data;
    },
    onSuccess: () => {
      setAdding(null);
      setNotice({ kind: "ok", text: "保存しました" });
      qc.invalidateQueries({ queryKey: ["slack-digests"] });
    },
    onError: (e: unknown) => setNotice({ kind: "error", text: msg(e) }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/settings/slack-digests/${id}`),
    onSuccess: () => {
      setNotice({ kind: "ok", text: "削除しました" });
      qc.invalidateQueries({ queryKey: ["slack-digests"] });
    },
    onError: (e: unknown) => setNotice({ kind: "error", text: msg(e) }),
  });

  const previewMutation = useMutation({
    mutationFn: async (p: { key: string; blocks: string[] }) =>
      ({ key: p.key, text: (await api.post("/settings/slack-digests/preview", { blocks: p.blocks })).data.data.text as string }),
    onSuccess: (r) => setPreview(r),
    onError: (e: unknown) => setNotice({ kind: "error", text: msg(e) }),
  });

  const sendNow = useMutation({
    mutationFn: async (id: string) => api.post(`/settings/slack-digests/${id}/send-now`),
    onSuccess: () => {
      setNotice({ kind: "ok", text: "送りました。Slack を確認してください。" });
      qc.invalidateQueries({ queryKey: ["slack-digests"] });
    },
    onError: (e: unknown) => setNotice({ kind: "error", text: msg(e) }),
  });

  if (error && !list) {
    return <ErrorPanel title="配信設定を読み込めませんでした" error={error} onRetry={() => refetch()} />;
  }

  const cards = [
    ...(adding ? [{ draft: adding, row: null as Digest | null, key: "new" }] : []),
    ...(list ?? []).map((d) => ({ draft: drafts[d.id], row: d, key: d.id })),
  ].filter((c) => !!c.draft);

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 sm:py-7">
        <header>
          <PageTitle>
            <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
            朝の1通（Slack）
          </PageTitle>
          <p className="mt-1 text-[13px] text-secondary-foreground">
            チャンネルごとに「いつ・何を出すか」を決めます。1件 = 1回の投稿なので、
            同じチャンネルを朝と夕方で2件に分けて、内容を変えられます。
            自分だけに届く分（DM）は「通知の受け取り方」で各自が切り替えます。
          </p>
        </header>

        {/* Slack 未設定 */}
        {meta && !meta.slack_configured && (
          <div className="rounded-lg border border-warning/40 bg-warning-surface px-4 py-3">
            <p className="flex items-start gap-1.5 text-[13px] font-bold text-warning-strong">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Slack のトークンがまだ入っていないため、送信はされません。
            </p>
            <p className="mt-1 text-[12px] text-secondary-foreground">
              設定だけ先に作れます。トークン（<code>SLACK_BOT_TOKEN</code>）が入ると、
              ここに登録した時刻から自動で送り始めます。
            </p>
          </div>
        )}

        {notice && (
          <div
            className={cn(
              "flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-[13px]",
              notice.kind === "ok"
                ? "border-success/30 bg-success/10 text-foreground"
                : "border-destructive/40 bg-destructive-surface text-destructive",
            )}
          >
            <span className="font-bold">{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-[12px] underline">
              閉じる
            </button>
          </div>
        )}

        {/* 個人への DM (自分の分だけ)。受け取るかどうかは各自が「通知の受け取り方」で決める */}
        {dmDraft && (
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-foreground">個人へのDM（自分の分だけ）</h2>
              <label className="flex items-center gap-2 text-[13px] text-secondary-foreground">
                <Switch
                  checked={dmDraft.enabled}
                  onCheckedChange={(v) => setDmDraft({ ...dmDraft, enabled: v })}
                />
                {dmDraft.enabled ? "有効" : "止めている"}
              </label>
            </div>
            <p className="mt-0.5 text-[13px] text-secondary-foreground">
              期限が過ぎたもの・今日が期限・まだ返事をしていない依頼を、本人だけに送ります。
              <strong className="font-bold">出すものが無い人には送りません。</strong>
              受け取るかどうかは各自が「通知の受け取り方」で切り替えます。
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-bold text-muted-foreground">送る時刻</label>
                <Input
                  type="time"
                  value={dmDraft.send_time}
                  onChange={(e) => setDmDraft({ ...dmDraft, send_time: e.target.value })}
                  className="h-9 max-w-[140px]"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {WD.map((w) => (
                  <button
                    key={w.n}
                    type="button"
                    onClick={() =>
                      setDmDraft({
                        ...dmDraft,
                        weekdays: dmDraft.weekdays.includes(w.n)
                          ? dmDraft.weekdays.filter((x) => x !== w.n)
                          : [...dmDraft.weekdays, w.n].sort(),
                      })
                    }
                    aria-pressed={dmDraft.weekdays.includes(w.n)}
                    className={cn(
                      "h-8 w-8 rounded-control border text-[12px] font-bold",
                      dmDraft.weekdays.includes(w.n)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            {(dm?.last_sent_at || dm?.last_error) && (
              <p className={cn("mt-2 flex items-center gap-1.5 text-[12px]", dm.last_error ? "text-destructive" : "text-muted-foreground")}>
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {dm.last_error
                  ? `届かなかった人がいます: ${dm.last_error}`
                  : `最後に送ったのは ${new Date(dm.last_sent_at!).toLocaleString("ja-JP")}`}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" className="h-9" disabled={saveDm.isPending} onClick={() => saveDm.mutate()}>
                保存
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" disabled={dmPreview.isPending} onClick={() => dmPreview.mutate()}>
                <Eye className="h-4 w-4" aria-hidden="true" />
                本文を確認する
              </Button>
              <Button
                type="button" size="sm" variant="outline" className="h-9 gap-1.5"
                disabled={dmSendNow.isPending || !meta?.slack_configured}
                onClick={() => dmSendNow.mutate()}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                自分にだけ送ってみる
              </Button>
            </div>
            {preview?.key === "dm" && (
              <div className="mt-3 rounded-control border border-border bg-secondary/40 p-3">
                <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">あなたに届く本文（送っていません）</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                  {preview.text}
                </pre>
              </div>
            )}
          </section>
        )}

        <h2 className="pt-1 text-[15px] font-bold text-foreground">チャンネルへの投稿</h2>

        {!adding && (
          <Button type="button" onClick={() => setAdding({ ...NEW_DRAFT })} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" />
            配信を追加
          </Button>
        )}

        {isLoading && !list ? (
          <p className="text-[13px] text-secondary-foreground">読み込んでいます…</p>
        ) : cards.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-8 w-8" aria-hidden="true" />}
            title="まだ配信がありません"
            description="「配信を追加」でチャンネルと時刻と内容を決めると、その時刻に自動で投稿します。"
          />
        ) : (
          <div className="space-y-3">
            {cards.map(({ draft, row, key }) => {
              const d = draft!;
              const hasMoney = d.blocks.some((b) => moneyKeys.has(b));
              const set = (patch: Partial<Draft>) => {
                if (key === "new") setAdding({ ...d, ...patch });
                else setDrafts((prev) => ({ ...prev, [key]: { ...d, ...patch } }));
              };
              const toggleBlock = (k: string) =>
                set({ blocks: d.blocks.includes(k) ? d.blocks.filter((x) => x !== k) : [...d.blocks, k] });
              const toggleDay = (n: number) =>
                set({ weekdays: d.weekdays.includes(n) ? d.weekdays.filter((x) => x !== n) : [...d.weekdays, n].sort() });

              return (
                <section key={key} className="rounded-lg border border-border bg-card p-4">
                  {/* 1行目: 覚え書き / 有効 */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Input
                      value={d.label}
                      onChange={(e) => set({ label: e.target.value })}
                      placeholder="覚え書き（例: 朝の共有 / 夕方のふりかえり）"
                      className="h-9 max-w-xs"
                      aria-label="覚え書き"
                    />
                    <label className="flex items-center gap-2 text-[13px] text-secondary-foreground">
                      <Switch checked={d.enabled} onCheckedChange={(v) => set({ enabled: v })} />
                      {d.enabled ? "有効" : "止めている"}
                    </label>
                  </div>

                  {/* 2行目: チャンネル / 時刻 / 曜日 */}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[12px] font-bold text-muted-foreground">投稿先</label>
                      {(meta?.channels.length ?? 0) > 0 ? (
                        <select
                          value={d.channel}
                          onChange={(e) => set({ channel: e.target.value })}
                          className="h-9 w-full rounded-control border border-border bg-card px-2 text-[13px]"
                        >
                          <option value="">選んでください</option>
                          {meta!.channels.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.is_private ? "🔒 " : "# "}{c.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <Input
                            value={d.channel}
                            onChange={(e) => set({ channel: e.target.value })}
                            placeholder="#gmo-onair-朝"
                            className="h-9"
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            チャンネルの一覧が取れないため手入力です（Slack App に <code>channels:read</code> を付けると選べます）。
                            投稿先に Bot を招待してください。
                          </p>
                        </>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] font-bold text-muted-foreground">送る時刻</label>
                      <Input
                        type="time"
                        value={d.send_time}
                        onChange={(e) => set({ send_time: e.target.value })}
                        className="h-9 max-w-[140px]"
                      />
                      <div className="mt-2 flex flex-wrap gap-1">
                        {WD.map((w) => (
                          <button
                            key={w.n}
                            type="button"
                            onClick={() => toggleDay(w.n)}
                            aria-pressed={d.weekdays.includes(w.n)}
                            className={cn(
                              "h-8 w-8 rounded-control border text-[12px] font-bold",
                              d.weekdays.includes(w.n)
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground",
                            )}
                          >
                            {w.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 3行目: 出す内容 */}
                  <div className="mt-3">
                    <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">出す内容</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {blocks.map((b) => (
                        <label
                          key={b.key}
                          className={cn(
                            "flex cursor-pointer items-start gap-2 rounded-control border px-2.5 py-2",
                            d.blocks.includes(b.key) ? "border-primary/50 bg-primary/5" : "border-border bg-card",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={d.blocks.includes(b.key)}
                            onChange={() => toggleBlock(b.key)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block text-[13px] font-bold text-foreground">
                              {b.label}
                              {b.money && <span className="ml-1 text-[11px] font-bold text-destructive">金額</span>}
                            </span>
                            <span className="block text-[11px] leading-snug text-muted-foreground">{b.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {hasMoney && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-control border border-destructive/40 bg-destructive-surface px-2.5 py-2 text-[12px] font-bold text-destructive">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        このチャンネルにいる全員に金額が見えます。ONAiR は金額を「案件」と「お金」の権限がある人にだけ返す作りなので、
                        選ぶとその範囲の外に出ます。
                      </p>
                    )}
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      中身が0件の項目は本文に出しません（空の見出しが並ぶと読み飛ばされるため）。個人名は出しません。
                    </p>
                  </div>

                  {/* 送信の記録 */}
                  {row && (row.last_sent_at || row.last_error) && (
                    <p className={cn("mt-2 flex items-center gap-1.5 text-[12px]", row.last_error ? "text-destructive" : "text-muted-foreground")}>
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {row.last_error
                        ? `最後に失敗しました: ${row.last_error}`
                        : `最後に送ったのは ${new Date(row.last_sent_at!).toLocaleString("ja-JP")}`}
                    </p>
                  )}

                  {/* 操作 */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-9"
                      disabled={save.isPending}
                      onClick={() => save.mutate(d)}
                    >
                      {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                      保存
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 gap-1.5"
                      disabled={previewMutation.isPending}
                      onClick={() => previewMutation.mutate({ key, blocks: d.blocks })}
                    >
                      <Eye className="h-4 w-4" aria-hidden="true" />
                      本文を確認する
                    </Button>
                    {row && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 gap-1.5"
                        disabled={sendNow.isPending || !meta?.slack_configured}
                        onClick={async () => {
                          if ((await confirmAction({ title: `${d.channel} に、いま1回だけ送ります。よろしいですか？` }))) {
                            sendNow.mutate(row.id);
                          }
                        }}
                      >
                        <Send className="h-4 w-4" aria-hidden="true" />
                        いま1回だけ送る
                      </Button>
                    )}
                    {key === "new" ? (
                      <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setAdding(null)}>
                        取りやめる
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="ml-auto h-9 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive-surface"
                        onClick={async () => {
                          if ((await confirmAction({ title: "この配信を削除します。よろしいですか？", confirmLabel: '削除する', tone: 'danger' }))) remove.mutate(row!.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        削除
                      </Button>
                    )}
                  </div>

                  {/* 本文プレビュー (送らない) */}
                  {preview?.key === key && (
                    <div className="mt-3 rounded-control border border-border bg-secondary/40 p-3">
                      <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">
                        いまのデータで作った本文（送っていません）
                      </p>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                        {preview.text}
                      </pre>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <p className="text-[12px] text-muted-foreground">
          時刻を過ぎてからサーバーが起きた場合は、1時間以内なら追いかけて送り、それより遅ければ送りません
          （朝の内容が夜に届くほうが困るため）。送れなかったことはこの画面に残ります。
        </p>
      </div>
    </PageTransition>
  );
}

function msg(e: unknown): string {
  const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return err?.response?.data?.error?.message ?? err?.message ?? "うまくいきませんでした";
}
