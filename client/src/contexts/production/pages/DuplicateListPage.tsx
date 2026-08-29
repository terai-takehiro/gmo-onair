/**
 * ⑤ 重複疑い（カレンダー・v4）
 *
 * ── 何のための画面か ────────────────────────────────────────
 *
 * スタジオ予約は「案件ステージ移行での自動生成」「メール取込・AI が起票」
 * 「人の手入力」の複数の経路から作られる。同じ枠を指す予約が題名の言い回し
 * （「収録」/「本番」・語順違い・全角半角違い）だけ違う形で二重に貼り付くことが
 * 多々あった。保存そのものは止めない（out_of_hours と同じ方針 — 締切間際に
 * 入れたい予約が入らないと業務が止まる）ので、疑わしい組をここに集めて
 * 人が個別に「重複だから消す／別物だから確認済みにする」を決める。
 *
 * ── 「重複ではない」は消さない ────────────────────────────────
 *
 * 印を外すだけで、予約そのものは残る。同名の別イベントを誤検知した場合の
 * 逃げ道（`possible_duplicate` を false に戻すだけ）。
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { invalidateBookingQueries } from "@/lib/bookingQueries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from "@gmo-onair/shared/src/client/ui/row";
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from "@gmo-onair/shared/src/client/states";
import { notifySuccess, notifyApiError } from "@gmo-onair/shared/src/client/notify";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import { useAuth } from "@/contexts/platform/AuthContext";
import { DUPLICATE_KEY, type DuplicateRow } from "./duplicates/duplicateLogic";

export default function DuplicateListPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("sales", "editor");
  const canDelete = hasPermission("sales", "manager");
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: DUPLICATE_KEY,
    queryFn: async () =>
      (await api.get("/studios/bookings/possible-duplicates/list")).data.data as DuplicateRow[],
  });

  const rows = query.data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: DUPLICATE_KEY });
    invalidateBookingQueries(qc);
    qc.invalidateQueries({ queryKey: ["unified-calendar"] });
  };

  const dismiss = useMutation({
    mutationFn: (id: string) => api.patch(`/studios/bookings/${id}/dismiss-duplicate`),
    onSuccess: () => { invalidate(); notifySuccess("確認済みにしました（予約はそのまま残ります）"); },
    onError: (e) => notifyApiError("確認済みにできませんでした", e),
    onSettled: () => setBusyId(null),
  });

  const drop = useMutation({
    mutationFn: (id: string) => api.delete(`/studios/bookings/${id}`),
    onSuccess: () => { invalidate(); notifySuccess("削除しました"); },
    onError: (e) => notifyApiError("削除できませんでした", e),
    onSettled: () => setBusyId(null),
  });

  const askDrop = async (b: DuplicateRow) => {
    const ok = await confirmAction({
      title: "この予約を削除しますか",
      description: `「${b.title}」を削除します。**元になった予約「${b.of_title ?? "（削除済み）"}」は残ります。**取り消しは効きません。`,
      confirmLabel: "削除する",
      tone: "danger",
    });
    if (ok) { setBusyId(b.id); drop.mutate(b.id); }
  };

  const fmt = (t: string | null) => (t ? t.slice(0, 16).replace("T", " ").replace(/-/g, "/") : "—");

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader title="重複疑い" sub={`${rows.length}件 ・ 複数の経路から同じ枠が二重に登録された疑いのある予約`} />

      {query.isError ? (
        <ErrorPanel title="重複疑いを読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" aria-hidden="true" />}
          title="重複の疑いがある予約はありません"
          description="同じ案件・時間帯の予約や、件名がよく似て時間帯・部屋が重なる予約ができると、ここに出ます。"
        />
      ) : (
        <div className="flex flex-col">
          <RowHeader className="hidden sm:flex">
            <RowMain>予定 ／ 重複の疑いの理由</RowMain>
            <RowSlot w={160}>元になった予約</RowSlot>
            {/* 「別物として確認済みにする」は 11 文字＋アイコンで 160px に入らない
                （実測 190px。切り詰めると何のボタンか読めなくなるので幅側で解決する） */}
            <RowSlot w={200}>{canEdit ? "決める" : ""}</RowSlot>
          </RowHeader>

          {rows.map((b) => (
            <Row key={b.id} align="start" stackOnMobile divider>
              <RowMain>
                <RowTitle>{b.title}</RowTitle>
                <RowSub>
                  {[fmt(b.start_time), b.gls_number, b.project_name].filter(Boolean).join(" ／ ")}
                </RowSub>
                <RowSub>{b.possible_duplicate_reason}</RowSub>
                {/* スマホは「元になった予約」列が落ちるので、**どの予約と重なっているか**を
                    ここに添える（無いと、何と重複しているか分からないまま消すことになる） */}
                <RowSub className="whitespace-normal sm:hidden">
                  {`元になった予約: ${b.of_title ?? "（削除済み）"}${b.of_start_time ? ` ・ ${fmt(b.of_start_time)}` : ""}`}
                </RowSub>
              </RowMain>

              <RowSlot w={160} hideOnMobile>
                <span className="text-sub-sm text-secondary-foreground">
                  {b.of_title ?? "（削除済み）"}
                  {b.of_start_time ? ` ・ ${fmt(b.of_start_time)}` : ""}
                </span>
              </RowSlot>

              <RowSlot w={200}>
                {canEdit && (
                  <span className="flex w-full flex-col gap-1">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      disabled={dismiss.isPending && busyId === b.id}
                      onClick={() => { setBusyId(b.id); dismiss.mutate(b.id); }}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />別物として確認済みにする
                    </Button>
                    {canDelete && (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        disabled={drop.isPending && busyId === b.id}
                        onClick={() => askDrop(b)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" aria-hidden="true" />この予約を削除
                      </Button>
                    )}
                  </span>
                )}
              </RowSlot>
            </Row>
          ))}
        </div>
      )}

      <p className="text-note text-muted-foreground">
        重複そのものは自動では消しません。<strong className="font-bold">同じ案件・時間帯が重なる予約</strong>、
        または<strong className="font-bold">件名がよく似て時間帯・部屋が重なる予約</strong>をここに集めています
        （全角半角・語順の違いなどの表記揺らぎも拾います）。「別物として確認済みにする」は印を外すだけで、
        予約そのものは残ります。
      </p>
    </div>
  );
}
