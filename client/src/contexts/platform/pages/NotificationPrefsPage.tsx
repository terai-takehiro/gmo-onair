/**
 * NotificationPrefsPage — 通知の受け取り方 (§4.15 / デザイン 18a・18b)
 *
 * **通知そのものは保存しない** (ベルの中身は既存データからの導出)。
 * ここに入るのは「どう受け取りたいか」だけ。
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

interface Prefs {
  morning_slack: boolean;
  morning_email: boolean;
  overdue_digest: boolean;
  delegation_instant: boolean;
}

const ROWS: Array<{ key: keyof Prefs; label: string; hint: string }> = [
  {
    key: "morning_slack",
    label: "朝の1通を Slack で受け取る",
    hint: "平日 6:00 に1通だけ。期限を過ぎているもの・今日が期限・今日の現場・確認待ちの件数と期限を書きます。",
  },
  {
    key: "morning_email",
    label: "朝の1通をメールでも受け取る",
    hint: "Slack を見ない日のための保険です。内容は同じです。",
  },
  {
    key: "overdue_digest",
    label: "期限を過ぎたものは1日1回まとめて知らせる",
    hint: "切ると都度知らせます。1件ごとに鳴ると結局見なくなるため、まとめるのを既定にしています。",
  },
  {
    key: "delegation_instant",
    label: "依頼を受けたときはすぐ知らせる",
    hint: "「いつまでに何を」が来た瞬間だけは待たせないほうがよいので、これだけ即時です。",
  },
];

export default function NotificationPrefsPage() {
  const qc = useQueryClient();
  const q = useQuery<Prefs>({
    queryKey: ["notification-prefs"],
    queryFn: async () => (await api.get("/dashboard/notification-prefs")).data.data,
  });
  const [form, setForm] = useState<Prefs | null>(null);
  useEffect(() => {
    if (q.data) setForm({ ...q.data });
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => api.put("/dashboard/notification-prefs", form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-prefs"] }),
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 sm:py-7">
        <header>
          <PageTitle icon={<Bell className="h-5 w-5 text-primary" aria-hidden="true" />}>
            通知の受け取り方
          </PageTitle>
          <p className="mt-1 text-[13px] text-secondary-foreground">
            通知が流れて消えることはありません。溜まる場所は上辺のベル、届くのは朝の1通だけです。
          </p>
        </header>

        {q.isError ? (
          <ErrorPanel title="設定を読み込めませんでした" error={q.error} onRetry={() => void q.refetch()} />
        ) : !form ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="読み込み中" />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-divider rounded-lg border border-border bg-card">
              {ROWS.map((r) => (
                <li key={r.key} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-foreground">{r.label}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-secondary-foreground">{r.hint}</p>
                  </div>
                  <Switch
                    checked={form[r.key]}
                    onCheckedChange={(v) => setForm({ ...form, [r.key]: v })}
                    aria-label={r.label}
                  />
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-end gap-2">
              {save.isSuccess && <span className="text-[13px] text-success">保存しました</span>}
              <Button disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                保存する
              </Button>
            </div>
            {save.isError && <ErrorPanel title="保存できませんでした" error={save.error} inputPreserved />}

            <p className="text-[12px] text-muted-foreground">
              朝の1通は数字と期限だけを書きます。「順調です」のような文は出しません。
              Slack への送信は現在 Claude 経由で行っています（サーバーから直接送る配線はまだありません）。
            </p>
          </>
        )}

        {/* 全社チャンネルへの投稿はここではなく管理者の画面 (自分の設定と混ぜない) */}
        <p className="text-[12px] text-secondary-foreground">
          ここは<strong className="font-bold">自分の受け取り方</strong>の設定です。
          全社チャンネルへの投稿は{" "}
          <a href="/settings/slack-digest" className="font-bold text-primary underline">
            朝の1通（Slack）
          </a>{" "}
          で、システム管理者が決めます。
        </p>
      </div>
    </PageTransition>
  );
}
