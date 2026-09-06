// 進行台本の一覧 — 1件ぶんのカード。旧 DashboardPage.tsx の DocCard をそのまま分割。
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Radio,
  Pencil,
  Trash2,
  Calendar,
  Clock,
  Play,
  ChevronRight,
  MapPin,
  Share2,
  Users,
  Lock,
  ListOrdered,
  CalendarClock,
} from "lucide-react";
import * as scheduleApi from "@/lib/scheduleApi";
import { type QsheetDocument, fmtDate, getDraftLabel, getDraftColor } from "./types";

// `2026-09-12` → `9/12`。カードの他バッジ（例: `9 セクション`）と同じ短さに揃える
// （フル書式の fmtDate は「2026年9月12日(金)」で1件のバッジには長すぎる）
function fmtMd(isoDate: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(isoDate);
  return m ? `${Number(m[1])}/${Number(m[2])}` : isoDate;
}

// 逆引き（この台本がスケジュール表のどの枠に結ばれているか）。14-schedule-v2-plan.md §3 B3。
// 無ければ何も描かない（このアプリの決めごと — 事実だけを出し、否定を並べない）。
// 結ばれる枠は kind が onair/rehearsal/recording の項目だけ（02-schedule.md §6-1）なので、
// 1件のカードに複数ヒットすることは実運用上まれ——最初の1件だけをバッジにする。
function ScheduleLinkBadge({ docId }: { docId: string }) {
  const { data } = useQuery({
    queryKey: ["schedule-items-for-document", docId],
    queryFn: () => scheduleApi.getScheduleItemsForDocument(docId),
    staleTime: 60 * 1000,
  });
  const ref = data?.[0];
  if (!ref) return null;
  return (
    <Link
      to={`/techops/schedules/${ref.scheduleId}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary hover:bg-primary/20"
      title="この進行台本が結ばれているスケジュール表の枠を開く"
    >
      <CalendarClock size={9} aria-hidden />
      スケジュール表: {fmtMd(ref.serviceDate)} {ref.title || ref.columnLabel}
    </Link>
  );
}

export function DocCard({
  doc,
  canManage,
  onNavigate,
  onOnAir,
  onDelete,
  onShare,
}: {
  doc: QsheetDocument;
  // ⚠️ `canManage` はサーバーではなくクライアントで計算する（機能追加をしない・
  // 03-app-structure-impl.md §11 #6・§8 PR G の注記）。渡す側（SheetListPage）で
  // `isAdmin || doc.created_by === currentUser.id` を計算して渡す。
  canManage: boolean;
  onNavigate: (id: string) => void;
  onOnAir: (id: string) => void;
  onDelete: (id: string) => void;
  onShare: (doc: QsheetDocument) => void;
}) {
  const meta = doc.data?.meta;
  const shareCount = doc.share_count || 0;
  const sectionCount = doc.section_count ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(doc.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNavigate(doc.id);
        }
      }}
      className="group p-3 sm:p-5 bg-card text-card-foreground rounded-2xl border border-border transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 cursor-pointer overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {/* Top row: title + badge + actions */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 sm:gap-2.5 mb-1 flex-wrap">
            <h3 className="text-sm sm:text-base font-bold truncate max-w-[60vw] sm:max-w-none">{meta?.title || doc.title || "無題"}</h3>
            <span className={`flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${getDraftColor(meta)}`}>
              {getDraftLabel(meta)}
            </span>
          </div>
          {/* GLS/Episode info */}
          {(doc.gls_number || doc.episode_code) && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {doc.gls_number && <span className="font-medium">{doc.gls_number}</span>}
              {doc.gls_number && doc.project_name && <span> {doc.project_name}</span>}
              {doc.episode_code && <span>{doc.gls_number ? " / " : ""}{doc.episode_code}</span>}
            </p>
          )}
          {meta?.location && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin size={11} aria-hidden />
              <span>{meta.location}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1 sm:ml-3 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigate(doc.id); }}
            className="p-1.5 sm:p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label="編集"
          >
            <Pencil size={14} aria-hidden />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOnAir(doc.id); }}
            className="inline-flex items-center gap-0.5 px-1.5 sm:px-2.5 py-1 sm:py-1.5 text-[11px] font-bold rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label="ONAIRを開始"
          >
            <Radio size={10} aria-hidden />
            <span className="hidden sm:inline">ONAIR</span>
          </button>
          {canManage && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onShare(doc); }}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="共有"
            >
              <Share2 size={14} aria-hidden />
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="削除"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 text-[11px]">
        {(meta?.broadcastDate || doc.broadcast_date) && (
          <div className="flex items-center gap-1.5">
            <Calendar size={10} className="text-muted-foreground flex-shrink-0" aria-hidden />
            <span className="text-muted-foreground">放送日</span>
            <span className="font-medium text-foreground">{fmtDate(meta?.broadcastDate || doc.broadcast_date)}</span>
          </div>
        )}
        {meta?.broadcastStartTime && (
          <div className="flex items-center gap-1.5">
            <Play size={10} className="text-muted-foreground flex-shrink-0" aria-hidden />
            <span className="text-muted-foreground">放送</span>
            <span className="font-medium text-foreground">{meta.broadcastStartTime}</span>
          </div>
        )}
        {meta?.recordingDate && (
          <div className="flex items-center gap-1.5">
            <Calendar size={10} className="text-muted-foreground flex-shrink-0" aria-hidden />
            <span className="text-muted-foreground">収録日</span>
            <span className="font-medium text-foreground">{fmtDate(meta.recordingDate)}</span>
          </div>
        )}
        {meta?.rehearsalDate && (
          <div className="flex items-center gap-1.5">
            <Calendar size={10} className="text-muted-foreground flex-shrink-0" aria-hidden />
            <span className="text-muted-foreground">リハ</span>
            <span className="font-medium text-foreground">{fmtDate(meta.rehearsalDate)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{doc.creator_name || "不明"}</span>
          <span className="inline-flex items-center gap-0.5">
            <Clock size={9} aria-hidden />
            {new Date(doc.updated_at).toLocaleDateString("ja-JP")}{" "}
            {new Date(doc.updated_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="inline-flex items-center gap-0.5" title="セクション数">
            <ListOrdered size={9} aria-hidden />
            {sectionCount} セクション
          </span>
          <ScheduleLinkBadge docId={doc.id} />
          {shareCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-primary" title={`${shareCount} 名に共有中`}>
              <Users size={10} aria-hidden />
              共有中 {shareCount}
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5" title="作成者と管理者のみ閲覧可能">
              <Lock size={9} aria-hidden />
              自分のみ
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-primary font-medium sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          台本を開く <ChevronRight size={14} aria-hidden />
        </div>
      </div>
    </div>
  );
}
