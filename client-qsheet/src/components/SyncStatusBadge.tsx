/**
 * SyncStatusBadge — 放送同期の状態 (§4.13 / デザイン 16b)
 *
 * ランダウン・プロンプター・音声サポートは OnAir から送られてくる進行を**受け取るだけ**の画面。
 * 切断しても画面には最後に届いた数字が残り続けるので、**黙って古い数字を見ている**のが一番危ない。
 * 切れているときは赤で「放送同期が切断されました」と出し、この画面の数字を信じないよう明示する。
 */
import { cn } from "@/lib/utils";

export default function SyncStatusBadge({
  connected, tone = "dark", className,
}: {
  connected: boolean;
  tone?: "dark" | "light";
  className?: string;
}) {
  const dark = tone === "dark";
  if (connected) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]",
          dark ? "text-white/60" : "text-muted-foreground",
          className
        )}
        title="OnAir から進行が届いています"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
        同期中
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-destructive px-2 py-1 text-[11px] font-bold text-destructive-foreground",
        className
      )}
      role="status"
      title="この画面の数字は最後に届いたまま止まっています"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
      放送同期が切断されました
    </span>
  );
}
