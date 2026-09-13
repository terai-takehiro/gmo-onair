// 運営マニュアルの編集画面 — 読み取り専用の理由を伝える帯（段E・production-manual.md §6-2-1）。
// 理由は3系統（確定済み・reader権限・ロックを持っていない）あるが、同時に出るのは1つだけ
// （確定済みが最優先。reader権限はロックの取り合いにそもそも参加しない）。文言は§6-2-1のまま。
// `ManualDetailPage.tsx`（1ファイル400行のラチェット）から帯の見た目だけを切り出したもの。
import { Button } from "@/components/ui/button";
import type { ManualEditLockState } from "./useManualEditLock";

interface Props {
  isFixed: boolean;
  canEdit: boolean;
  canManage: boolean;
  lock: ManualEditLockState;
}

export default function ManualLockBanner({ isFixed, canEdit, canManage, lock }: Props) {
  if (isFixed) {
    return (
      <p className="rounded-note border border-warning-border bg-warning-surface px-3 py-2 text-note text-foreground">
        <strong>確定済みです。</strong>
        {canManage
          ? "編集するには「仕上がり」から確定を解いてください。"
          : "編集するには確定を解く必要があります。マニュアルの管理者にご相談ください。"}
      </p>
    );
  }

  if (!canEdit) {
    return (
      <p className="rounded-note border border-border bg-muted/30 px-3 py-2 text-note text-muted-foreground">
        閲覧権限のため、この画面は読むだけです。
      </p>
    );
  }

  if (!lock.checking && !lock.held) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-note border border-warning-border bg-warning-surface px-3 py-2 text-note text-foreground">
        <span>
          <strong>{lock.heldByName || "他のユーザー"}さんが編集中です。</strong>いまは読むだけになっています。
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-tap"
            onClick={lock.requestHandoff}
            disabled={lock.requesting || lock.handoffRequested}
          >
            {lock.handoffRequested ? "申し出ました" : "編集を代わってほしい"}
          </Button>
          {/* manager だけ「待たずに取り上げる」ことができる（§6-2-1「強制解除」）。
              元の保持者には次のハートビートで「引き継ぎました」の通知が出る */}
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              className="min-h-tap"
              onClick={lock.takeover}
              disabled={lock.takingOver}
            >
              {lock.takingOver ? "引き継ぎ中…" : "強制的に引き継ぐ"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (lock.held && lock.requestedByName) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-note border border-info-border bg-info-surface px-3 py-2 text-note text-foreground">
        <span>
          <strong>{lock.requestedByName}さん</strong>が編集を代わってほしいと言っています。
        </span>
        <Button variant="outline" size="sm" className="min-h-tap shrink-0" onClick={lock.release}>
          渡す
        </Button>
      </div>
    );
  }

  return null;
}
