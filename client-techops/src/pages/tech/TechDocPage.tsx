// 技術資料 — ②映像パッチ／③技術スタッフの親（設計: docs/design/v4/tech-docs.md §6②③）。
// 見出し・状態・版・タブ・編集ロック・保存の知らせをここが持ち、表の中身は
// PatchTable.tsx（②）と StaffTable.tsx（③・C3 が書く）が描く。
// スマホは閲覧だけ（TechDocMobileView.tsx）。PC/スマホで部品ごと入れ替える。
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, FileOutput, MoreHorizontal } from "lucide-react";
import { useIsMobile } from "@gmo-onair/shared/src/client-v4/mobile";
import { Delayed, ErrorPanel, SkeletonRows } from "@gmo-onair/shared/src/client/states";
import { Badge } from "@gmo-onair/shared/src/client/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import BufferedInput from "@/components/editor/BufferedInput";
import { notifyError } from "@/lib/notify";
import { useAuth } from "@/hooks/useAuth";
import { useTechDoc } from "@/hooks/useTechDoc";
import { useTechMasters } from "@/hooks/useTechMasters";
// ⚠️ 複製と削除は `useTechDoc` の契約に無いので、C1 の API 包み（techApi.ts）を直に呼ぶ。
// 名前が違っていたら統合のときに合わせる（最終報告に記載）。
import { createTechDoc, deleteTechDoc } from "@/lib/techApi";
import { StaffTable } from "@/pages/tech/StaffTable";
import { buildJackIndex, panelKindsOf } from "./patchDerive";
import { PatchTable } from "./PatchTable";
import { PatchRowExtras } from "./PatchRowExtras";
import { usePopoverDismiss } from "./patchPopover";
import { TechDocMobileView } from "./TechDocMobileView";
import { revLabel } from "./techStatus";

/** `2026-10-10T16:40:00Z` → `10/10 16:40 保存` */
function savedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())} 保存`;
}

export default function TechDocPage() {
  const { id = "" } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { currentUser, hasPermission } = useAuth();
  const tab: "patch" | "staff" = pathname.endsWith("/staff") ? "staff" : "patch";

  const doc = useTechDoc(id);
  const masters = useTechMasters();
  const detail = doc.detail;

  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * 書き込みを1か所で包んで「保存中…／保存しました」を出す。
   * **失敗の知らせは出さない** — `useTechDoc` が自分で notifyError して読み直すため
   * （二重に出ると同じ失敗が2回見える）。
   *
   * ⚠️ `useTechDoc` は失敗を投げずに `false` で返す。**返り値を見ずに「保存しました」を
   * 出すと、保存できていないのに成功したように見える**（実ブラウザで踏んだ）ので、
   * `true` のときだけ出す。返り値はそのまま呼び出し側（③技術スタッフの表）へ渡す。
   */
  const run = useCallback(async (fn: () => Promise<boolean>): Promise<boolean> => {
    setStatus("saving");
    try {
      const ok = await fn();
      setStatus(ok ? "saved" : "idle");
      if (ok) window.setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
      return ok;
    } catch {
      setStatus("idle");
      return false;
    }
  }, []);

  const canEditPerm = hasPermission("qsheet", "editor");
  const canManage = hasPermission("qsheet", "manager");
  const isFixed = detail?.doc.status === "fixed";
  const lockEnabled = !!detail && canEditPerm && !isFixed && !isMobile;
  const heldByMe = !!detail && !!currentUser && detail.doc.locked_by === currentUser.id;
  const canEdit = lockEnabled && heldByMe;
  const requestedByMe = !!detail && !!currentUser && detail.doc.lock_requested_by === currentUser.id;
  const requestedByOther = !!detail && !!detail.doc.lock_requested_by && !requestedByMe;

  const apiRef = useRef(doc);
  useEffect(() => { apiRef.current = doc; });
  const heldRef = useRef(false);
  useEffect(() => { heldRef.current = heldByMe; }, [heldByMe]);

  // マウントで取り、60秒ごとに延ばす。離れるときに返す（§5-4）。
  // `lock()` は「空いていれば取る・自分なら延ばす」を兼ねていて、結果は
  // `useTechDoc` が読み直して `locked_by` に反映するので、ここでは呼ぶだけでよい。
  //
  // **延長は自分が持っている間だけ**にする。`useTechDoc` の `lock()` は取れなかった
  // ときに自分で知らせを出すので、持っていないのに 60 秒ごとに呼ぶと、同じ知らせが
  // 出続ける。取り上げられたときは次の延長が1回だけ失敗して帯に切り替わる。
  useEffect(() => {
    if (!lockEnabled || !id) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const beat = async () => {
      await apiRef.current.lock();
      if (!alive) return;
      timer = setTimeout(() => { if (heldRef.current) void beat(); }, 60_000);
    };
    void beat();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      void apiRef.current.unlock();
    };
  }, [id, lockEnabled]);

  const onDuplicate = async () => {
    if (!detail) return;
    try {
      const made = await createTechDoc({
        title: `${detail.doc.title} の複製`,
        project_id: detail.doc.project_id,
        program_id: detail.doc.program_id,
        copy_from: detail.doc.id,
      });
      navigate(`/techops/tech-docs/${made.id}`);
    } catch {
      notifyError("技術資料を複製できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    }
  };

  const onDelete = async () => {
    if (!detail) return;
    const ok = await confirmAction({
      title: "この技術資料を削除しますか？",
      description: "映像パッチと技術スタッフの行もいっしょに画面から消えます。",
      confirmLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteTechDoc(detail.doc.id);
      navigate(listPath(detail.doc.project_id));
    } catch {
      notifyError("技術資料を削除できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    }
  };

  if (doc.loading && !detail) {
    return <PageShell><Delayed><SkeletonRows rows={5} /></Delayed></PageShell>;
  }
  if (doc.error || !detail) {
    return (
      <PageShell>
        <ErrorPanel title="技術資料を読み込めませんでした" error={doc.error} onRetry={() => void doc.reload()} />
      </PageShell>
    );
  }

  const d = detail.doc;
  const kinds = panelKindsOf(masters.panels);
  const jackIndex = buildJackIndex(masters.devices, kinds);

  return (
    <PageShell>
      <div>
        <Link to={listPath(d.project_id)} className="flex h-8 w-fit items-center gap-1 rounded-control px-1.5 text-sub font-bold text-primary hover:bg-muted/30">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />技術資料
        </Link>
      </div>

      <PageHeader
        title={
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <BufferedInput
              value={d.title} onCommit={(v) => void run(() => doc.updateDoc({ title: v, expected_updated_at: d.updated_at }))}
              disabled={!canEdit} aria-label="技術資料の名前"
              className="h-10 w-64 min-w-0 rounded-control border border-transparent bg-transparent px-1 text-h1 text-foreground outline-none hover:border-border-faint focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-80"
            />
            {d.doc_no && <span className="num rounded-badge bg-primary-surface px-2 py-0.5 text-badge text-primary">{d.doc_no}</span>}
            <Badge variant={isFixed ? "success" : "warning"}>{isFixed ? "確定" : "下書き"}</Badge>
          </span>
        }
        sub={
          <span className="num flex flex-wrap items-center gap-2">
            {/* ⚠️ 版の数え方は `revLabel`（techStatus.ts）の1本だけ。一覧・書き出し・札と同じ規則 */}
            {revLabel(d) && <span>{revLabel(d)}</span>}
            <span>{savedAt(d.updated_at)}</span>
            {status === "saving" && <span className="text-primary">保存中…</span>}
            {status === "saved" && <span className="text-success">保存しました</span>}
            {!canEditPerm && <span>閲覧権限のため読むだけです</span>}
          </span>
        }
        primaryAction={
          // ④書き出し（`/techops/tech-docs/:id/print`・PC専用・tech-docs.md §8）
          <Button asChild variant="outline" className="h-10">
            <Link to={`/techops/tech-docs/${id}/print`}>
              <FileOutput className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />書き出す
            </Link>
          </Button>
        }
      >
        <DocMenu
          open={menuOpen} onOpen={setMenuOpen} canManage={canManage} isFixed={!!isFixed}
          onDuplicate={() => void onDuplicate()}
          onFix={() => void run(() => doc.fix())}
          onUnfix={() => void run(() => doc.unfix())}
          onDelete={() => void onDelete()}
        />
      </PageHeader>

      {!isMobile && (
        <div className="flex items-end gap-1 border-b border-border">
          <TabLink to={`/techops/tech-docs/${id}`} label="映像パッチ" n={detail.patch_rows.length} on={tab === "patch"} />
          <TabLink to={`/techops/tech-docs/${id}/staff`} label="技術スタッフ" n={detail.staff_rows.length} on={tab === "staff"} />
        </div>
      )}

      {!isMobile && canEditPerm && !isFixed && !heldByMe && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-note border border-warning-border bg-warning-surface px-3 py-2 text-note text-foreground">
          <span>
            <strong>{detail.locked_by_name || "他のユーザー"}さんが編集中です。</strong>閲覧のみになっています。
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {/* ⚠️ 要求したことが画面に出ないと、押せたのかどうかが分からず何度も押される。
                送れたら同じ場所を「編集を要求しました」に入れ替える（運営マニュアルと同じ形） */}
            {requestedByMe ? (
              <span className="text-note text-muted-foreground">編集を要求しました</span>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void run(() => doc.requestLock())}>編集を要求</Button>
            )}
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => void run(() => doc.takeoverLock())}>引き継ぐ</Button>
            )}
          </span>
        </div>
      )}

      {/* 編集している本人に「待っている人がいる」ことを伝える（`lock_requested_by_name` の出口） */}
      {!isMobile && heldByMe && requestedByOther && (
        <p className="rounded-note border border-primary-border bg-primary-surface px-3 py-2 text-note text-foreground">
          <strong>{detail.lock_requested_by_name}さんが編集を求めています。</strong>
          区切りのよいところでこの画面を閉じると、編集を渡せます。
        </p>
      )}

      {!isMobile && isFixed && (
        <p className="rounded-note border border-warning-border bg-warning-surface px-3 py-2 text-note text-foreground">
          <strong>確定済みです。</strong>
          {canManage ? "編集するには、右上のメニューから確定を解除してください。" : "編集するには確定の解除が要ります。管理者にご相談ください。"}
        </p>
      )}

      {isMobile ? (
        <TechDocMobileView docId={id} tab={tab} patchRows={detail.patch_rows} staffRows={detail.staff_rows} />
      ) : tab === "patch" ? (
        <div className="flex min-w-0 items-start gap-4">
          <PatchTable
            rows={detail.patch_rows} devices={masters.devices} panels={masters.panels} canEdit={canEdit}
            onCreate={(patch) => void run(() => doc.createPatchRow(patch))}
            onUpdate={(rowId, patch) => void run(() => doc.updatePatchRow(rowId, patch))}
            onDelete={(rowId) => void run(() => doc.deletePatchRow(rowId))}
            onReorder={(ids) => void run(() => doc.reorderPatchRows(ids))}
          />
          <PatchRowExtras rows={detail.patch_rows} jackIndex={jackIndex} />
        </div>
      ) : (
        <StaffTable
          doc={d} rows={detail.staff_rows} canEdit={canEdit}
          onCreate={(row) => run(() => doc.createStaffRow(row))}
          onUpdate={(rowId, patch) => run(() => doc.updateStaffRow(rowId, patch))}
          onDelete={(rowId) => run(() => doc.deleteStaffRow(rowId))}
          onReorder={(ids) => run(() => doc.reorderStaffRows(ids))}
        />
      )}
    </PageShell>
  );
}

/** ①一覧へ戻る道。案件が分かっていればその案件で絞った一覧に戻す */
function listPath(projectId: string | null): string {
  return projectId ? `/techops/tech-docs?project=${encodeURIComponent(projectId)}` : "/techops/tech-docs";
}

function TabLink({ to, label, n, on }: { to: string; label: string; n: number; on: boolean }) {
  return (
    <Link
      to={to}
      className={`-mb-px flex h-10 items-center gap-2 border-b-2 px-3.5 text-list ${
        on ? "border-primary text-primary" : "border-transparent text-muted-foreground"
      }`}
    >
      {label}
      <span className={`num rounded-badge px-1.5 py-0.5 text-badge ${on ? "bg-primary-surface text-primary" : "bg-muted text-muted-foreground"}`}>{n}</span>
    </Link>
  );
}

function DocMenu({ open, onOpen, canManage, isFixed, onDuplicate, onFix, onUnfix, onDelete }: {
  open: boolean;
  onOpen: (v: boolean) => void;
  canManage: boolean;
  isFixed: boolean;
  onDuplicate: () => void;
  onFix: () => void;
  onUnfix: () => void;
  onDelete: () => void;
}) {
  const item = "flex h-9 w-full items-center px-3 text-left text-sub text-foreground hover:bg-muted/30";
  const boxRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(boxRef, open, () => onOpen(false));
  return (
    <div ref={boxRef} className="relative shrink-0">
      <Button variant="outline" size="icon" className="h-10 w-10" aria-label="その他の操作" onClick={() => onOpen(!open)}>
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-card border border-border bg-card py-1 shadow-lg">
          <button type="button" className={item} onClick={() => { onOpen(false); onDuplicate(); }}>複製する</button>
          {canManage && !isFixed && <button type="button" className={item} onClick={() => { onOpen(false); onFix(); }}>確定する</button>}
          {canManage && isFixed && <button type="button" className={item} onClick={() => { onOpen(false); onUnfix(); }}>確定を解除</button>}
          <button
            type="button"
            className="flex h-9 w-full items-center px-3 text-left text-sub text-destructive hover:bg-destructive-surface"
            onClick={() => { onOpen(false); onDelete(); }}
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
}
