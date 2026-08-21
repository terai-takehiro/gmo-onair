import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@gmo-onair/shared/src/client/ui";
import { Copy, Check, ExternalLink, Loader2, RefreshCw, Ban } from "lucide-react";
import api from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docId: string;
}

interface ShareInfo {
  token: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  last_seen_at: string | null;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function AudioShareDialog({ open, onOpenChange, docId }: Props) {
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const buildUrl = (token: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    // ⚠️ パスは資料IDのまま (1文字も変えない)。トークンは ?token= に付けるだけ
    // — Socket.IO の room キーが資料IDのままなので、パスをトークンに差し替えると
    // 誰もいない room に join して cue 同期が黙って止まる (実装設計 02 §10-1)。
    return `${base}/qsheet/audio/${docId}?token=${encodeURIComponent(token)}`;
  };

  const url = share ? buildUrl(share.token) : "";

  // ダイアログを開いたら、有効なトークンを取得 (無ければサーバー側が自動発行)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setRevoked(false);
    api.get(`/qsheet/documents/${docId}/audio-share`)
      .then((res) => {
        if (cancelled) return;
        setShare(res.data.data as ShareInfo);
      })
      .catch(() => {
        if (!cancelled) notifyError("共有URLの取得に失敗しました");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, docId]);

  useEffect(() => {
    if (!open || !url) { setQrDataUrl(null); return; }
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

  const handleReissue = async () => {
    // client-qsheet は凍結アプリ (ConfirmHost 未設置)。confirmAction() は器が無いと何も表示せず
    // false を返すだけなので、同ファイル内の他の確認と同じく素の confirm() を使う
    if (!confirm("新しい URL を発行します。今の URL（QR）はその場で使えなくなります。よろしいですか？")) return; // ui-tokens-ok
    setBusy(true);
    try {
      const res = await api.post(`/qsheet/documents/${docId}/audio-share/reissue`);
      setShare(res.data.data as ShareInfo);
      setRevoked(false);
      notifySuccess("新しい URL を発行しました");
    } catch {
      notifyError("URL の再発行に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    // 同上 (凍結アプリなので素の confirm() を使う)
    if (!confirm("この URL を失効させます。配布済みの QR はすべて使えなくなり、元に戻せません。よろしいですか？")) return; // ui-tokens-ok
    setBusy(true);
    try {
      await api.post(`/qsheet/documents/${docId}/audio-share/revoke`);
      setShare(null);
      setRevoked(true);
      notifySuccess("URL を失効させました");
    } catch {
      notifyError("URL の失効に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleIssueAgain = async () => {
    setBusy(true);
    try {
      const res = await api.get(`/qsheet/documents/${docId}/audio-share`);
      setShare(res.data.data as ShareInfo);
      setRevoked(false);
    } catch {
      notifyError("共有URLの発行に失敗しました");
    } finally {
      setBusy(false);
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

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="animate-spin" size={24} aria-hidden />
          </div>
        ) : revoked || !share ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-sm text-muted-foreground text-center">
              有効な共有 URL はありません。発行すると QR コードが表示されます。
            </p>
            <button
              type="button"
              onClick={handleIssueAgain}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-11 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="animate-spin" size={14} aria-hidden /> : null}
              URL を発行する
            </button>
          </div>
        ) : (
          <>
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
                  className={`flex-none inline-flex items-center gap-1 px-3 py-1.5 min-h-11 text-xs font-semibold rounded-r-md border border-l-0 border-border transition-colors ${
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

            <div className="text-[11px] text-muted-foreground border-t border-border pt-2 flex flex-col gap-0.5">
              <span>作成: {share.created_by_name ?? "不明"} ・ {formatDateTime(share.created_at)}</span>
              {share.last_seen_at && <span>最後に開かれた: {formatDateTime(share.last_seen_at)}</span>}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={handleReissue}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-11 text-xs font-semibold rounded-lg border border-border hover:bg-accent disabled:opacity-60"
              >
                <RefreshCw size={13} aria-hidden />
                新しい URL にする
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-11 text-xs font-semibold rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-60"
              >
                <Ban size={13} aria-hidden />
                この URL を失効させる
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md p-2 leading-relaxed">
              ※ シナリオ本文や放送日は返却されません。マイク香盤データのみ表示されます。
              「新しい URL にする」で再発行、「この URL を失効させる」で今すぐ使えなくできます（取り消せません）。
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
