import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@gmo-onair/shared/src/client/ui";
import { Copy, Check, ExternalLink, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docId: string;
}

export default function AudioShareDialog({ open, onOpenChange, docId }: Props) {
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/qsheet/audio/${docId}`
    : `/qsheet/audio/${docId}`;

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 256, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => { cancelled = true; };
  }, [open, url]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback: select text
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch { /* noop */ }
      document.body.removeChild(ta);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>音声サポート画面 共有 URL</DialogTitle>
          <DialogDescription>
            音声オペレーター用のリアルタイム同期マイク香盤画面です。認証不要でこの URL を知っていれば誰でも閲覧できます。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <div className="rounded-lg bg-white p-3 border border-border">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QRコード" className="size-56 block" />
            ) : (
              <div className="size-56 flex items-center justify-center text-muted-foreground">
                <Loader2 className="animate-spin" size={24} aria-hidden />
              </div>
            )}
          </div>

          <div className="w-full flex items-center gap-1">
            <input
              readOnly
              value={url}
              className="flex-1 min-w-0 px-2.5 py-1.5 text-[12px] bg-muted border border-border rounded-l-md outline-none focus:ring-2 focus:ring-ring/30"
              onFocus={(e) => e.currentTarget.select()}
              aria-label="共有URL"
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`flex-none inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-r-md border border-l-0 border-border transition-colors ${
                copied ? "bg-success/10 text-success" : "bg-card hover:bg-accent text-foreground"
              }`}
              aria-label="URLをコピー"
            >
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              {copied ? "コピーしました" : "コピー"}
            </button>
          </div>

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink size={12} aria-hidden />
            新しいタブで開く
          </a>
        </div>

        <p className="text-[11px] text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md p-2 leading-relaxed">
          ※ シナリオ本文や放送日は返却されません。マイク香盤データのみ表示されます。
          番組終了後は URL を再生成する仕組みは現在ありません — 必要時はドキュメントごと削除してください。
        </p>
      </DialogContent>
    </Dialog>
  );
}
