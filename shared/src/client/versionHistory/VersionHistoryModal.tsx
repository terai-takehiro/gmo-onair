// shared/src/client/versionHistory/VersionHistoryModal.tsx — バージョン履歴 モーダル
// dataUrl (既定 "/version-history.json"、案件管理アプリの public/ に生成される静的ファイル。
// 案件管理アプリが "/" を担当するため他アプリからも同一オリジンで到達可能) を fetch し、
// 検索・一覧表示・JSON ダウンロードを提供する。
import { useEffect, useMemo, useState } from "react";
import { Search, History, Download, Loader2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Input } from "../ui/input";
import { cn } from "../utils";
import type { VersionHistoryData, VersionHistoryEntry } from "./types";
import { renderInline, RichDescription } from "./richDescription";

const PAGE_SIZE = 20;
const LOAD_MORE_STEP = 30;
// PRが多い版はCLAUDE.mdの要約より`docs/version-history.md`の全文アーカイブの方が長いため、
// generate-version-history.mjsは全文の方を採用する。「現在のバージョン」は既定で開いて見せたいが、
// 全文はPR数十本ぶんの本文（数万字）になり得るため、開いた瞬間に画面が埋まってしまう。
// この長さを超える場合は他の版と同じく畳んだ状態で始める。
const AUTO_EXPAND_MAX_CHARS = 4000;

function matches(entry: VersionHistoryEntry, q: string) {
  if (!q) return true;
  return (
    entry.version.includes(q) ||
    entry.title.toLowerCase().includes(q) ||
    entry.description.toLowerCase().includes(q)
  );
}

interface VersionHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** バージョン履歴 JSON の URL（既定: サイトルート直下の /version-history.json） */
  dataUrl?: string;
  /** ヘッダーに表示するプロダクト名 */
  productLabel?: string;
}

export default function VersionHistoryModal({
  open,
  onOpenChange,
  dataUrl = "/version-history.json",
  productLabel = "GMO ONAiR",
}: VersionHistoryModalProps) {
  const [data, setData] = useState<VersionHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setVisibleCount(PAGE_SIZE);
    setLoading(true);
    setError(null);
    fetch(dataUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: VersionHistoryData) => setData(json))
      .catch((err) => setError(err instanceof Error ? err.message : "バージョン履歴を読み込めませんでした"))
      .finally(() => setLoading(false));
  }, [open, dataUrl]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (data ? data.versions.filter((v) => matches(v, q)) : []), [data, q]);
  const visible = q ? filtered : filtered.slice(0, visibleCount);
  const hasMore = !q && filtered.length > visible.length;

  const handleDownload = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gmo-onair-version-history_v${data.currentVersion ?? "latest"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-3rem)] h-[88vh] max-h-[880px] p-0 flex flex-col gap-0 overflow-hidden">
        {/* ヘッダー */}
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History className="h-[18px] w-[18px]" />
            </span>
            <span className="truncate">{productLabel} バージョン履歴</span>
            {data?.currentVersion && (
              <span className="ml-1 shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                現在 v{data.currentVersion}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed sm:text-sm">
            これまでの更新内容の一覧です。AIでの解析・要約用に、そのままの内容を JSON でダウンロードもできます。
          </DialogDescription>
        </DialogHeader>

        {/* 検索 + ダウンロード */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5 sm:px-6">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="バージョン番号・キーワードで検索"
              className="h-9 pl-9 text-sm"
            />
          </div>
          <button
            onClick={handleDownload}
            disabled={!data}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
            style={{ touchAction: "manipulation" }}
            title="テキスト形式で書き出す"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">テキスト形式で書き出す</span>
            <span className="sm:hidden">書き出す</span>
          </button>
        </div>

        {/* 本文 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              読み込み中…
            </div>
          )}
          {error && !loading && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              バージョン履歴を読み込めませんでした。少し待ってから、もう一度お試しください。
            </div>
          )}
          {!loading && !error && data && (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                全 {data.count} 件中 {q ? filtered.length : visible.length} 件を表示
              </p>
              <ol className="space-y-2.5">
                {visible.map((v, i) => (
                  <li
                    key={`${v.version}-${i}`}
                    className={cn(
                      "rounded-xl border p-3.5",
                      v.isCurrent ? "border-success/30 bg-success/[0.04]" : "border-border"
                    )}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold font-number tabular-nums",
                          v.isCurrent ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                        )}
                      >
                        v{v.version}
                      </span>
                      {v.isCurrent && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          現在のバージョン
                        </span>
                      )}
                      <span className="text-sm font-bold leading-snug text-foreground">{renderInline(v.title)}</span>
                    </div>
                    <RichDescription
                      text={v.description}
                      defaultExpanded={v.isCurrent && v.description.length <= AUTO_EXPAND_MAX_CHARS}
                    />
                  </li>
                ))}
              </ol>
              {filtered.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">該当する項目はありません</p>
              )}
              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => setVisibleCount((c) => c + LOAD_MORE_STEP)}
                    className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-accent"
                    style={{ touchAction: "manipulation" }}
                  >
                    さらに読み込む（残り {filtered.length - visible.length} 件）
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
