// 会場図面 — 資料の帯（設計: docs/design/v4/venue-layout.md §6②）。
// 戻る／`VL-…`／名前／下書き・確定の札／保存状態／「◯◯さんが編集中」／
// 仕上がりを見るボタン。`VenueEditorDesktop.tsx` から見た目だけを切り出したもの
// （1ファイル400行のラチェット対策）。
import { useNavigate } from "react-router-dom";
import { ChevronLeft, FileOutput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@gmo-onair/shared/src/client/ui/badge";
import BufferedInput from "@/components/editor/BufferedInput";
import type { VenueLayoutStatus } from "@gmo-onair/shared/src/venue/types";
import type { VenueEditLockState } from "./hooks/useVenueEditLock";

const STATUS_LABEL: Record<VenueLayoutStatus, string> = { draft: "下書き", fixed: "確定", archived: "過去の版" };

interface Props {
  docNo: string | null;
  title: string;
  status: VenueLayoutStatus;
  saving: boolean;
  canEdit: boolean;
  canManage: boolean;
  editable: boolean;
  lock: VenueEditLockState;
  returnTo: string | null;
  onTitleCommit: (v: string) => void;
  onPreview: () => void;
  onFix: () => void;
  onUnfix: () => void;
}

export default function VenueResourceBand({ docNo, title, status, saving, canEdit, canManage, editable, lock, returnTo, onTitleCommit, onPreview, onFix, onUnfix }: Props) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button type="button" onClick={() => navigate("/techops/venue-layouts")} className="flex h-8 shrink-0 items-center gap-1 rounded-control px-1.5 text-sub font-bold text-primary hover:bg-muted/30">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />図面一覧
      </button>
      {returnTo && (
        <button type="button" onClick={() => navigate(returnTo)} className="h-8 shrink-0 rounded-control border border-border px-2 text-sub-sm font-bold hover:bg-muted/30">
          運営マニュアルに戻る
        </button>
      )}
      <span className="h-5 w-px shrink-0 bg-border" />
      {docNo && <span className="num shrink-0 text-[11.5px] font-bold text-muted-foreground">{docNo}</span>}
      <BufferedInput
        value={title}
        onCommit={onTitleCommit}
        disabled={!editable}
        aria-label="図面の名前"
        className="h-9 w-56 min-w-0 shrink border-0 bg-transparent px-1 text-h2 font-extrabold shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
      />
      <Badge variant={status === "fixed" ? "success" : status === "draft" ? "warning" : "secondary"}>{STATUS_LABEL[status]}</Badge>
      {canManage && status === "draft" && <Button variant="outline" size="sm" className="h-8" onClick={onFix}>確定する</Button>}
      {canManage && status === "fixed" && <Button variant="outline" size="sm" className="h-8" onClick={onUnfix}>確定を解く</Button>}
      {saving && <span className="shrink-0 text-sub-sm text-muted-foreground">保存中…</span>}
      {!canEdit && <span className="shrink-0 text-sub-sm text-muted-foreground">閲覧権限のため読むだけです</span>}
      {canEdit && !lock.checking && lock.held && <span className="shrink-0 rounded-badge border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-bold text-primary">あなたが編集中</span>}
      {canEdit && !lock.checking && !lock.held && (
        <span className="flex shrink-0 items-center gap-2 rounded-badge border border-warning-border bg-warning-surface px-2 py-0.5 text-[11px] font-bold">
          {lock.heldByName || "他のユーザー"}さんが編集中
          <Button variant="outline" size="sm" className="h-8 px-2 text-[11px]" onClick={lock.requestHandoff} disabled={lock.requesting || lock.handoffRequested}>
            {lock.handoffRequested ? "申し出ました" : "代わってほしい"}
          </Button>
          {canManage && (
            <Button variant="outline" size="sm" className="h-8 px-2 text-[11px]" onClick={lock.takeover} disabled={lock.takingOver}>
              {lock.takingOver ? "引き継ぎ中…" : "強制的に引き継ぐ"}
            </Button>
          )}
        </span>
      )}
      {lock.held && lock.requestedByName && (
        <span className="flex shrink-0 items-center gap-2 rounded-badge border border-info-border bg-info-surface px-2 py-0.5 text-[11px] font-bold">
          {lock.requestedByName}さんが代わってほしいと言っています
          <Button variant="outline" size="sm" className="h-8 px-2 text-[11px]" onClick={lock.release}>渡す</Button>
        </span>
      )}
      <span className="flex-1" />
      <Button variant="outline" onClick={onPreview} className="h-8">
        <FileOutput className="mr-1 h-3.5 w-3.5" aria-hidden="true" />仕上がり・書き出し
      </Button>
    </div>
  );
}
