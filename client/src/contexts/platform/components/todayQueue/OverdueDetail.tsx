// 期限超過の展開 (§4.4)
//   見せるもの: 直近のやり取り3件 + 案件の状態 (ヨミ / 想定金額 / 実施日)
//   押せるもの: もう送った (完了) / 期限を引き直す (日時指定つき)
// 案件ページに飛ばさず、開いた場所で終端 (完了 or 新しい期限) に到達させる。

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, Users, MessageSquare, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { PROJECT_STAGE, statusOf } from "@gmo-onair/shared/src/constants/statuses";
import { Delayed, SkeletonRows } from "@gmo-onair/shared/src/client/states";
import { dueOption, str, yen } from "./types";

const ACTIVITY_ICON: Record<string, typeof Mail> = {
  email: Mail,
  phone: Phone,
  meeting: Users,
  visit: Users,
  demo: Users,
  follow_up: MessageSquare,
  followup: MessageSquare,
  other: FileText,
};

const ACTIVITY_LABEL: Record<string, string> = {
  email: "メール",
  phone: "電話",
  meeting: "打合せ",
  visit: "訪問",
  demo: "デモ",
  follow_up: "フォロー",
  followup: "フォロー",
  proposal: "提案",
  contract: "契約",
  other: "その他",
};

interface ActivityRow {
  id: string;
  activity_type: string;
  subject: string | null;
  activity_date: string | null;
  user_name?: string | null;
}

export interface OverdueDetailProps {
  meta: Record<string, unknown>;
  pending: boolean;
  onComplete: () => void;
  onPostpone: (date: string) => void;
}

export function OverdueDetail({ meta, pending, onComplete, onPostpone }: OverdueDetailProps) {
  const [pickDate, setPickDate] = useState("");
  const projectId = str(meta.project_id);

  const { data: activities, isLoading } = useQuery<ActivityRow[]>({
    queryKey: ["today", "overdue-activities", projectId],
    queryFn: async () =>
      (await api.get("/activity-logs", { params: { project_id: projectId, limit: 3 } })).data.data,
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const stage = str(meta.stage);
  const stageLabel = stage ? statusOf(PROJECT_STAGE, stage).label : "—";
  const eventStart = str(meta.event_start);
  const eventEnd = str(meta.event_end);
  const period =
    eventStart && eventEnd && eventStart !== eventEnd
      ? `${eventStart} 〜 ${eventEnd}`
      : eventStart || "未定";

  const options = [dueOption(1, 18), dueOption(3, 18), dueOption(7, 18)];

  return (
    <div className="space-y-3 border-t border-divider pt-3">
      {/* 案件の状態 */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-[12px] text-muted-foreground">ヨミ</dt>
          <dd className="font-bold text-foreground">{stageLabel}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted-foreground">想定金額</dt>
          <dd className="font-bold tabular-nums text-foreground">{yen(meta.expected_amount)}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted-foreground">実施日</dt>
          <dd className="font-bold text-foreground">{period}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted-foreground">担当</dt>
          <dd className="font-bold text-foreground">{str(meta.assigned_to_name) || "—"}</dd>
        </div>
      </dl>

      {/* 直近のやり取り3件 */}
      <div>
        <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">直近のやり取り</p>
        {isLoading ? (
          <Delayed>
            <SkeletonRows rows={2} rowHeight={40} />
          </Delayed>
        ) : !activities || activities.length === 0 ? (
          <p className="text-[13px] text-secondary-foreground">
            やり取りの記録がありません。まず1件記録すると次にやることが決まります。
          </p>
        ) : (
          <ul className="space-y-1">
            {activities.slice(0, 3).map((a) => {
              const Icon = ACTIVITY_ICON[a.activity_type] ?? FileText;
              return (
                <li key={a.id} className="flex items-start gap-2 text-[13px]">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {str(a.activity_date).slice(5)}
                  </span>
                  <span className="shrink-0 rounded bg-secondary px-1.5 text-[11px] font-bold text-secondary-foreground">
                    {ACTIVITY_LABEL[a.activity_type] ?? a.activity_type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {a.subject || "(件名なし)"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 終端アクション */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-9" disabled={pending} onClick={onComplete}>
          もう送った（完了）
        </Button>
        <span className="text-[12px] text-muted-foreground">期限を引き直す:</span>
        {options.map((o) => (
          <Button
            key={o.date}
            size="sm"
            variant="outline"
            className="h-9"
            disabled={pending}
            onClick={() => onPostpone(o.date)}
          >
            {o.label}
          </Button>
        ))}
        <span className="flex items-center gap-1.5">
          <input
            type="date"
            value={pickDate}
            onChange={(e) => setPickDate(e.target.value)}
            aria-label="期限の日付を指定"
            className={cn(
              "h-9 rounded-control border border-input bg-background px-2 text-[13px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled={pending || !pickDate}
            onClick={() => pickDate && onPostpone(pickDate)}
          >
            この日に
          </Button>
        </span>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="処理中" />}
      </div>
      <p className="text-[12px] text-muted-foreground">
        引き直した期限は 18:00 として扱います。時刻まで決めたいときは案件のやり取りから記録してください。
      </p>
    </div>
  );
}
