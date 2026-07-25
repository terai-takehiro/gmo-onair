/**
 * 本番のURLを配る (§4.13 / デザイン 16b)
 *
 * 従来は「音声サポートの公開URL」専用ダイアログだった。
 * 本番は OnAir・ランダウン・プロンプター・音声サポートの4役割で、
 * それぞれ別のURLを口で伝えるのが実際の運用だったので、**1か所で全部配れる**ようにした。
 *
 * ここで一番大事なのは **音声サポートだけ認証が要らない**ことを画面に書くこと。
 * 同じ見た目のURLが4本並ぶと、社外に渡してよいのがどれか分からなくなる。
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@gmo-onair/shared/src/client/ui";
import { Copy, Check, ExternalLink, Loader2, Radio, List, MonitorPlay, Mic, Lock, Globe } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docId: string;
}

type RoleId = "onair" | "rundown" | "prompter" | "audio";

const ROLES: {
  id: RoleId;
  label: string;
  who: string;
  Icon: typeof Radio;
  /** 認証が要るか。音声サポートだけ公開 */
  auth: boolean;
}[] = [
  { id: "onair", label: "OnAir", who: "進行の親（Space で次へ）", Icon: Radio, auth: true },
  { id: "rundown", label: "ランダウン", who: "ディレクター（押し・巻きを見る）", Icon: List, auth: true },
  { id: "prompter", label: "プロンプター", who: "出演者・カンペ", Icon: MonitorPlay, auth: true },
  { id: "audio", label: "音声サポート", who: "音声オペレーター（マイク香盤）", Icon: Mic, auth: false },
];

function pathFor(role: RoleId, docId: string): string {
  // 音声サポートは認証なしの公開URL (§5.1 で壊してはいけないもの)
  return role === "audio" ? `/qsheet/audio/${docId}` : `/qsheet/live/${docId}?role=${role}`;
}

export default function AudioShareDialog({ open, onOpenChange, docId }: Props) {
  const [role, setRole] = useState<RoleId>("onair");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}${pathFor(role, docId)}`;
  const active = ROLES.find((r) => r.id === role)!;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setQrDataUrl(null);
    QRCode.toDataURL(url, { width: 256, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((dataUrl) => { if (!cancelled) setQrDataUrl(dataUrl); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [open, url]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
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
          <DialogTitle>本番のURLを配る</DialogTitle>
          <DialogDescription>
            役割を選ぶと、その画面のQRコードとURLが出ます。受け取った人はこの1本を開くだけで自分の役割の画面になります。
          </DialogDescription>
        </DialogHeader>

        {/* 役割ピッカー */}
        <div className="grid grid-cols-2 gap-1.5">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRole(r.id)}
              aria-pressed={role === r.id}
              className={`flex items-start gap-2 rounded-control border px-2.5 py-2 text-left transition-colors ${
                role === r.id
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              <r.Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-foreground">{r.label}</span>
                <span className="block text-[10px] leading-snug text-muted-foreground">{r.who}</span>
              </span>
            </button>
          ))}
        </div>

        {/* 認証の有無 — 社外に渡してよいのはどれか */}
        <p
          className={`flex items-start gap-1.5 rounded-control border p-2 text-[11px] leading-relaxed ${
            active.auth
              ? "border-border bg-muted text-muted-foreground"
              : "border-warning bg-warning-surface text-warning-strong"
          }`}
        >
          {active.auth
            ? <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            : <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
          {active.auth
            ? "ONAiR にログインしている人だけ開けます。案件メンバーには既定で見えます。"
            : "認証はありません。このURLを知っている人は誰でも開けます（社外の音声さんに渡すための経路です）。出るのはマイク香盤だけで、台本本文と放送日は返りません。"}
        </p>

        <div className="flex flex-col items-center gap-3 py-1">
          <div className="rounded-lg border border-border bg-white p-3">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`${active.label} のQRコード`} className="block size-48" />
            ) : (
              <div className="flex size-48 items-center justify-center text-muted-foreground">
                <Loader2 className="animate-spin" size={24} aria-hidden />
              </div>
            )}
          </div>

          <div className="flex w-full items-center gap-1">
            <input
              readOnly
              value={url}
              className="min-w-0 flex-1 rounded-l-md border border-border bg-muted px-2.5 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-ring/30"
              onFocus={(e) => e.currentTarget.select()}
              aria-label={`${active.label} のURL`}
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex flex-none items-center gap-1 rounded-r-md border border-l-0 border-border px-3 py-1.5 text-xs font-semibold transition-colors ${
                copied ? "bg-success/10 text-success" : "bg-card text-foreground hover:bg-accent"
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

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          番組が終わったあとにURLを無効にする仕組みは、まだ持っていません。閉じたいときはドキュメントごと削除してください。
        </p>
      </DialogContent>
    </Dialog>
  );
}
