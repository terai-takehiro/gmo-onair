// 項目編集シートの「台本への橋」節。14-schedule-v2-plan.md §3 B3・02-schedule.md §6-2。
// `ScheduleItemDialog.tsx` を 400 行の基準内に収めるため別ファイルに切り出した
// （新規作成・既存台本を開く、に加えて「結び直す」「外す」をここに足す）。
//
// サーバーは `PUT /schedules/:id/items/:itemId/qsheet`（`{ qsheet_document_id }`。
// `null` で外す）が既にあり、既存台本にも・複数の項目からも結べる（1文書:複数項目は
// 意図した仕様・02-schedule.md §6-1「リハと本番で同じ台本を使う」）。ここは配線のみ。
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useDebounced } from "@gmo-onair/shared/src/client/hooks/useDebounced";
import * as scheduleApi from "@/lib/scheduleApi";
import type { ScheduleItem } from "@gmo-onair/shared/src/schedule/types";

// `GET /techops/documents` が返す一覧の形（documents.routes.ts）のうち、
// ピッカーの表示に要る列だけ。`SheetListPage.tsx` の `QsheetDocument` と重複するが、
// あちらは進行台本アプリの型でここはスケジュール表アプリの型——2つのワークスペースの
// 型を無理に共有しない（プロジェクト内の他の箇所と同じ判断）
interface DocOption {
  id: string;
  title: string;
  gls_number: string | null;
  project_name: string | null;
  program_name: string | null;
  data?: { meta?: { title?: string } };
}

interface Props {
  scheduleId: string;
  item: ScheduleItem;
  onOpenScript: () => void;
  onCreateScript: () => void;
  /**
   * 結び直し／外しが成功したら、サーバーが返した最新の項目を渡して呼ぶ。
   * 呼び出し側（`ScheduleItemDialog.tsx`）はこれを使って `SchedulePage.tsx` の
   * `selectedItem` を差し替える——表の再取得だけでは、開いたままのこのダイアログの
   * `item` が古いままになる（§3 B3・実装中に見つけたバグ）。
   */
  onLinked: (item: ScheduleItem) => void;
}

export default function ScheduleItemDocLink({ scheduleId, item, onOpenScript, onCreateScript, onLinked }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [busy, setBusy] = useState(false);

  const docsQuery = useQuery({
    queryKey: ["schedule-doc-link-candidates", debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await api.get(`/techops/documents?${params}`);
      return res.data.data as DocOption[];
    },
    enabled: pickerOpen,
    staleTime: 30 * 1000,
  });

  const openPicker = () => { setPickerOpen(true); setSearch(""); };
  const closePicker = () => setPickerOpen(false);

  const relink = async (documentId: string | null) => {
    setBusy(true);
    try {
      const updated = await scheduleApi.setDocumentLink(scheduleId, item.id, documentId);
      notifySuccess(documentId ? "結び直しました" : "結びを外しました");
      closePicker();
      onLinked(updated);
    } catch {
      // 404（渡した台本にアクセスできない・存在秘匿）・400（linkable でない kind。
      // ここに来る時点で呼び出し元が canLink 判定済みなので通常は起きない）等、
      // 理由を問わず一様に伝える——ユーザーが打てる手はどちらも同じ（選び直すか諦めるか）
      notifyError("結び直しできませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    } finally {
      setBusy(false);
    }
  };

  // いま結んでいる台本自身は候補に出さない（選んでも変化が無く紛らわしいため）
  const candidates = (docsQuery.data ?? []).filter((d) => d.id !== item.qsheet_document_id);

  return (
    <div className="space-y-2">
      {item.qsheet_document_id ? (
        item.link_broken ? (
          <p className="text-sm text-destructive">結んでいた進行台本が見つかりません（削除されています）。</p>
        ) : (
          <Button type="button" variant="outline" className="min-h-[44px] w-full" onClick={onOpenScript}>
            進行台本を開く
          </Button>
        )
      ) : (
        <Button type="button" variant="outline" className="min-h-[44px] w-full" onClick={onCreateScript}>
          この枠から進行台本を作る
        </Button>
      )}

      {!pickerOpen ? (
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" className="min-h-[44px] flex-1" onClick={openPicker}>
            {item.qsheet_document_id || item.link_broken ? "別の進行台本に結び直す" : "既存の進行台本に結ぶ"}
          </Button>
          {(item.qsheet_document_id || item.link_broken) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-[44px] flex-1 text-destructive"
              onClick={() => relink(null)}
              disabled={busy}
            >
              結びを外す
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-border bg-card p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="題で検索"
              className="pl-8"
              aria-label="結び直す進行台本を検索"
            />
          </div>
          <div className="mt-2 max-h-48 overflow-y-auto">
            {docsQuery.isLoading && <p className="px-2 py-3 text-xs text-muted-foreground">読み込み中…</p>}
            {!docsQuery.isLoading && candidates.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">見つかりません</p>
            )}
            {candidates.slice(0, 30).map((d) => (
              <button
                key={d.id}
                type="button"
                disabled={busy}
                onClick={() => relink(d.id)}
                className="flex min-h-[44px] w-full flex-col items-start justify-center rounded-md px-2 text-left hover:bg-accent disabled:opacity-50"
              >
                <span className="text-sm text-foreground">{d.data?.meta?.title || d.title || "無題"}</span>
                <span className="text-xs text-muted-foreground">
                  {[d.gls_number, d.project_name, d.program_name].filter(Boolean).join(" ") || "案件・番組なし"}
                </span>
              </button>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-1 min-h-[44px] w-full" onClick={closePicker}>
            閉じる
          </Button>
        </div>
      )}
    </div>
  );
}
