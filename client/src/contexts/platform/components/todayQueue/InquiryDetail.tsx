// 問い合わせの展開 (§4.4)
//   見せるもの: AI がまとめた内容 + AI の判定 (重要度 / 分類 / 対応の要否) + 見学の候補日
//   押せるもの: 対応済み (終端) / 元のメールを開く
// 見学候補は「今日から2週間で全部屋が空いている日」の先頭3日。
// 空き照会は既存の GET /studios/bookings/availability をそのまま使う (新規APIなし)。

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Loader2, CalendarCheck } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/platform/AuthContext";
import { str } from "./types";

const IMPORTANCE_LABEL: Record<string, string> = { high: "重要", medium: "普通", low: "低" };

interface AvailabilityRoom {
  room_id: string;
  room_name: string;
  location_name: string;
  free_days: string[];
}
interface AvailabilityData {
  from: string;
  to: string;
  days: string[];
  rooms: AvailabilityRoom[];
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];

function fmtDay(d: string): string {
  const dt = new Date(`${d}T00:00:00`);
  if (isNaN(dt.getTime())) return d;
  return `${dt.getMonth() + 1}月${dt.getDate()}日(${WD[dt.getDay()]})`;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface InquiryDetailProps {
  meta: Record<string, unknown>;
  editable: boolean;
  pending: boolean;
  onHandled: () => void;
}

export function InquiryDetail({ meta, editable, pending, onHandled }: InquiryDetailProps) {
  const { hasPermission } = useAuth();
  const canSeeStudio = hasPermission("studio");

  // 見学候補: 全部屋が終日空いている日を先頭3件
  const { data: avail, isLoading: availLoading } = useQuery<AvailabilityData>({
    queryKey: ["today", "inquiry-availability"],
    queryFn: async () =>
      (await api.get("/studios/bookings/availability", { params: { from: addDays(1), to: addDays(14) } })).data.data,
    enabled: canSeeStudio,
    staleTime: 300_000,
  });

  const candidates = (() => {
    if (!avail || avail.rooms.length === 0) return [];
    const freeSets = avail.rooms.map((r) => new Set(r.free_days));
    return avail.days.filter((d) => freeSets.every((s) => s.has(d))).slice(0, 3);
  })();

  const importance = str(meta.importance);
  const actionNeeded = meta.action_needed;
  const url = str(meta.url);

  return (
    <div className="space-y-3 border-t border-divider pt-3">
      {/* AI の判定 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] font-bold text-muted-foreground">AI の判定:</span>
        {importance && (
          <Badge variant={importance === "high" ? "destructive" : "outline"} className="text-[11px]">
            重要度 {IMPORTANCE_LABEL[importance] ?? importance}
          </Badge>
        )}
        {meta.category ? (
          <Badge variant="outline" className="text-[11px]">
            {str(meta.category)}
          </Badge>
        ) : null}
        <Badge variant="outline" className="text-[11px]">
          {actionNeeded ? "対応が必要" : "対応は不要"}
        </Badge>
      </div>

      {/* 本文 (AI がまとめたもの) */}
      <div>
        <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">届いた内容</p>
        <p className="whitespace-pre-wrap rounded-control border border-border bg-secondary/50 px-3 py-2 text-[13px] leading-relaxed text-foreground">
          {str(meta.summary) || "内容が取れていません。元のメールを開いて確認してください。"}
        </p>
        {str(meta.sender) && (
          <p className="mt-1 text-[12px] text-muted-foreground">送ってきた人: {str(meta.sender)}</p>
        )}
      </div>

      {/* 見学の候補日 */}
      {canSeeStudio && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
            <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
            見学を提案できる日（全部屋が空いている日）
          </p>
          {availLoading ? (
            <p className="text-[13px] text-secondary-foreground">空きを調べています…</p>
          ) : candidates.length === 0 ? (
            <p className="text-[13px] text-secondary-foreground">
              今後2週間で全部屋が空いている日はありません。予定から個別に空きを探してください。
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {candidates.map((d) => (
                <li
                  key={d}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-[12px] font-bold text-foreground"
                >
                  {fmtDay(d)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 終端アクション */}
      <div className="flex flex-wrap items-center gap-2">
        {editable ? (
          <Button size="sm" className="h-9" disabled={pending} onClick={onHandled}>
            対応済みにする
          </Button>
        ) : (
          <p className="text-[13px] text-secondary-foreground">
            対応済みにするには「日常業務」の書ける権限が必要です。
          </p>
        )}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-control border border-border px-3 text-[13px] text-secondary-foreground hover:bg-secondary"
          >
            元のメールを開く
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
        <a
          href="/daily/inquiries"
          className="inline-flex h-9 items-center gap-1.5 rounded-control border border-border px-3 text-[13px] text-secondary-foreground hover:bg-secondary"
        >
          分類や重要度を直す
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="処理中" />}
      </div>
    </div>
  );
}
