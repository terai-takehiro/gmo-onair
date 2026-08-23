// shared/src/client/mcpInfo/McpInfoModal.tsx — MCP コネクタ情報モーダル
// dataUrl (既定 "/mcp-tools.json"、案件管理アプリの public/ に scripts/generate-mcp-tools.mjs が生成。
// 案件管理アプリが "/" を担当するため他アプリからも同一オリジンで到達可能) を fetch し、
// MCP サーバーの接続方法 + ツール一覧を表示する。ツール一覧はサーバーの registerTool から
// 機械生成されるため常に最新。
import { useEffect, useMemo, useState } from "react";
import { Search, Plug, Loader2, AlertTriangle, Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Input } from "../ui/input";
import { cn } from "../utils";

interface McpTool {
  name: string;
  title: string;
  type: "read" | "write";
}
interface McpCategory {
  key: string;
  label: string;
  tools: McpTool[];
}
interface McpToolsData {
  generatedFrom?: string;
  toolCount: number;
  categories: McpCategory[];
}

interface McpInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** MCP ツールカタログ JSON の URL（既定: サイトルート直下の /mcp-tools.json） */
  dataUrl?: string;
}

const MCP_ENDPOINT = "https://gmo-onair.jp/api/v1/mcp";

export default function McpInfoModal({
  open,
  onOpenChange,
  dataUrl = "/mcp-tools.json",
}: McpInfoModalProps) {
  const [data, setData] = useState<McpToolsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setLoading(true);
    setError(null);
    fetch(dataUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: McpToolsData) => setData(json))
      .catch((err) => setError(err instanceof Error ? err.message : "取得に失敗しました"))
      .finally(() => setLoading(false));
  }, [open, dataUrl]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!data) return [];
    if (!q) return data.categories;
    return data.categories
      .map((c) => ({
        ...c,
        tools: c.tools.filter(
          (t) => t.name.toLowerCase().includes(q) || t.title.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
        ),
      }))
      .filter((c) => c.tools.length > 0);
  }, [data, q]);

  const copyEndpoint = () => {
    navigator.clipboard?.writeText(`${MCP_ENDPOINT}?key=<APIキー>`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-3rem)] h-[88vh] max-h-[880px] p-0 flex flex-col gap-0 overflow-hidden">
        {/* ヘッダー */}
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plug className="h-[18px] w-[18px]" />
            </span>
            <span className="truncate">MCP コネクタ</span>
            {data?.toolCount != null && (
              <span className="ml-1 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {data.toolCount} ツール
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed sm:text-sm">
            Claude などの AI から GMO ONAiR を操作するための MCP コネクタです。接続方法と、AI が使えるツールの一覧を掲載しています。
          </DialogDescription>
        </DialogHeader>

        {/* 本文 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {/* 接続ガイド (静的) */}
          <section className="mb-5 rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4">
            <h3 className="mb-2 text-sm font-bold text-foreground">接続方法</h3>
            <ol className="space-y-2 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
              <li>
                <span className="font-medium text-foreground">① Claude アプリ（カスタムコネクタ）:</span> 設定 → コネクタ → カスタムコネクタを追加。URL に下記を貼り付けます（OAuth 欄は空のまま）。
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md bg-background border border-border px-2 py-1.5 text-[11px] text-foreground">
                    {MCP_ENDPOINT}?key=&lt;APIキー&gt;
                  </code>
                  <button
                    onClick={copyEndpoint}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium hover:bg-accent"
                    style={{ touchAction: "manipulation" }}
                    title="URL をコピー"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "コピー済" : "コピー"}
                  </button>
                </div>
              </li>
              <li>
                <span className="font-medium text-foreground">② Claude Code（CLI）:</span>{" "}
                <code className="rounded bg-background border border-border px-1.5 py-0.5 text-[11px]">claude mcp add --transport http onair {MCP_ENDPOINT} --header "Authorization: Bearer &lt;APIキー&gt;"</code>
              </li>
              <li className="text-amber-600 dark:text-amber-500">
                ⚠️ サーバー側でツールを追加・変更したら、コネクタの<strong>ツールリスト更新（再接続）</strong>が必要です（一覧は接続時にキャッシュされます）。
              </li>
              <li className="text-amber-600 dark:text-amber-500">
                ⚠️ <code className="rounded bg-background border border-border px-1 text-[11px]">?key=</code> 付き URL は秘密情報です。共有・掲示しないでください。
              </li>
            </ol>
          </section>

          {/* 検索 */}
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ツール名・機能で探す"
              className="h-9 pl-9 text-sm"
            />
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              読み込み中…
            </div>
          )}
          {error && !loading && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              ツール一覧の取得に失敗しました（{error}）。
            </div>
          )}
          {!loading && !error && data && (
            <div className="space-y-4">
              {filtered.map((c) => (
                <section key={c.key}>
                  <h4 className="mb-1.5 flex items-center gap-2 text-xs font-bold text-foreground">
                    {c.label}
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{c.tools.length}</span>
                  </h4>
                  <ul className="space-y-1">
                    {c.tools.map((t) => (
                      <li key={t.name} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            t.type === "write"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400"
                              : "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-400"
                          )}
                        >
                          {t.type === "write" ? "書込" : "参照"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{t.title}</span>
                        <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{t.name}</code>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {filtered.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">該当するツールが見つかりません。</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
