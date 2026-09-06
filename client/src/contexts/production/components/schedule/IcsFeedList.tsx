/**
 * 外部カレンダー連携（`IcsFeedsDialog`）の「連携中のカレンダー」一覧。
 *
 * **このダイアログを開く用途の大半は「止まっていないかの確認」**なので、ダイアログの
 * 先頭に置く（以前は Google・Outlook のパネル・手順ガイド・追加フォームをすべて越えた
 * 最下段にあり、繋がっているものとエラーを見るのに毎回スクロールが要った。同じ内容を出す
 * `pages/calendarSettings/FeedsTab.tsx` は先に一覧を出しており、ダイアログだけ順序が逆だった）。
 *
 * 呼び出し側が1ファイル 400 行を超えたので、この一覧だけ切り出している
 * （JSX は1文字も変えずに移した）。
 */
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import type { IcsFeed } from "./scheduleShared";

interface Props {
  feeds: IcsFeed[];
  isLoading: boolean;
  onSync: (feedId: string) => void;
  syncing: boolean;
  onDelete: (feedId: string) => void;
  deleting: boolean;
}

export function IcsFeedList({ feeds, isLoading, onSync, syncing, onDelete, deleting }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">連携中のカレンダー</p>
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : feeds.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">まだ連携がありません。</p>
      ) : (
        feeds.map((f) => (
          <div key={f.id} className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{f.label}</span>
              <code className="text-[11px] text-muted-foreground">{f.url_masked}</code>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  type="button"
                  size="sm" variant="outline" className="h-8"
                  onClick={() => onSync(f.id)}
                  disabled={syncing}
                  title="今すぐ同期"
                >
                  {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  type="button"
                  size="sm" variant="outline" className="h-8 text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => { if (confirm(`「${f.label}」の連携を解除しますか？（同期済みの予定も削除されます）`)) onDelete(f.id); }}
                  disabled={deleting}
                  title="連携を解除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {f.last_synced_at
                ? `最終同期: ${new Date(f.last_synced_at).toLocaleString("ja-JP")}${f.event_count != null ? ` ・ ${f.event_count} 件` : ""}`
                : "未同期"}
            </p>
            {f.last_error && (
              <p className="flex items-start gap-1 text-[11px] text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                {f.last_error}
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
