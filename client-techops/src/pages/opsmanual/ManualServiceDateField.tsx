// マニュアルの本番/開催の予定日（`service_date`）の表示・編集。`ManualDetailPage.tsx` のタイトルの
// 隣（sub 行）に置く小さな部品として切り出した（1ファイル400行のラチェットに触れたため）。
//
// レビュー指摘（P2）: 段Cまで `service_date` を設定する経路が無く、常に null のまま
// だった（表紙の日付表示・スケジュール表 resolver の日付一致がどちらも不発になる）。
// タイトルの編集（`titleMutation`）と同じ形——楽観ロック・編集ロックの扱いも揃える。
import { useMutation } from "@tanstack/react-query";
import { formatDate } from "@gmo-onair/shared/src/client/format";
import * as manualApi from "@/lib/manualApi";
import { isConflict, isLockError } from "@/lib/manualApi";
import { notifyError } from "@/lib/notify";

interface Props {
  manualId: string;
  serviceDate: string | null;
  updatedAt: string | undefined;
  editable: boolean;
  onInvalidate: () => void;
}

export default function ManualServiceDateField({ manualId, serviceDate, updatedAt, editable, onInvalidate }: Props) {
  const mutation = useMutation({
    mutationFn: (value: string) =>
      manualApi.updateManual(manualId, { service_date: value || null, expected_updated_at: updatedAt }),
    onSuccess: onInvalidate,
    onError: (err: unknown) => {
      if (isLockError(err)) {
        notifyError("編集ロックが他の人に移っているか、確定されました。", { description: "画面を読み込み直します。" });
        onInvalidate();
        return;
      }
      if (isConflict(err)) {
        notifyError("ほかの人が先に保存していました。", { description: "最新の内容を読み込み直します。" });
        onInvalidate();
        return;
      }
      notifyError("予定日を保存できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    },
  });

  if (!editable) {
    return serviceDate ? <span>{formatDate(serviceDate)}</span> : null;
  }

  return (
    <input
      type="date"
      aria-label="本番/開催の予定日"
      defaultValue={serviceDate ?? ""}
      key={serviceDate ?? ""}
      onChange={(e) => mutation.mutate(e.target.value)}
      className="min-h-tap rounded-control border border-input bg-background px-2 py-1 text-sub-sm"
    />
  );
}
