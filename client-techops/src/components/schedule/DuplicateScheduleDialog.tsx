// 複製（「同じイベントの別の日として複製する」）。14-schedule-v2-plan.md §3 B5・§3-3
//
// 訊くのは複製先の日付だけ。複製するのは 題・列・項目・表示時間帯・拠点（サーバー側が
// 元の表からそのまま複製する・server/.../schedule.service.ts の duplicateSchedule）。
// 共有は写さない（案件メンバーの自動共有で足りる）。状態は常に「下書き」に戻る。
// PC は中央、375px は下端のシート（`FormDialog`＝`Sheet` の既定の振る舞い）。
import { useEffect, useState } from "react";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifyError } from "@/lib/notify";
import * as scheduleApi from "@/lib/scheduleApi";
import { nextDayStr } from "@/lib/dateFmt";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;
  /** 元の表の日付（'YYYY-MM-DD'）。既定値は翌日にする */
  sourceServiceDate: string;
  /** 写せたら呼ぶ（新しい表を受け取る。呼び出し側で遷移・トースト・キャッシュ無効化を行う） */
  onDuplicated: (newSchedule: { id: string }) => void;
}

export default function DuplicateScheduleDialog({ open, onOpenChange, scheduleId, sourceServiceDate, onDuplicated }: Props) {
  const [date, setDate] = useState(() => nextDayStr(sourceServiceDate));
  const [busy, setBusy] = useState(false);

  // 開くたびに「元の日の翌日」で作り直す（他のシートと同じ理由: 常にマウントされたまま）
  useEffect(() => {
    if (open) setDate(nextDayStr(sourceServiceDate));
  }, [open, sourceServiceDate]);

  const save = async () => {
    if (!date) { notifyError("日付を入力してください。"); return; }
    setBusy(true);
    try {
      const created = await scheduleApi.duplicateSchedule(scheduleId, date);
      onDuplicated(created);
      onOpenChange(false);
    } catch {
      notifyError("写せませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="別の日として複製する"
      sub="題・列・項目・表示時間帯・拠点を複製します。共有は複製しません（案件メンバーには自動で見えます）。"
      size="sm"
      onSubmit={(e) => { e.preventDefault(); void save(); }}
      footer={
        <FormDialogFooter>
          <Button type="submit" className="min-h-[44px]" disabled={busy}>複製する</Button>
        </FormDialogFooter>
      }
    >
      <div>
        <Label htmlFor="duplicate-service-date">複製先の日付</Label>
        <Input
          id="duplicate-service-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 min-h-[44px]"
        />
      </div>
    </FormDialog>
  );
}
