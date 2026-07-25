/**
 * LiveRoleSwitch — 本番の役割切替 (§4.13 / デザイン 16b)
 *
 * OnAir・ランダウン・プロンプター・音声サポートは同じ本番の役割。
 * どの画面からでも他の役割に移れるようにして、「役割ごとに別のURLを教える」のをやめる。
 */
import { useNavigate } from "react-router-dom";
import { Radio, List, MonitorPlay, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLES = [
  { id: "onair", label: "OnAir", Icon: Radio },
  { id: "rundown", label: "ランダウン", Icon: List },
  { id: "prompter", label: "プロンプター", Icon: MonitorPlay },
  { id: "audio", label: "音声サポート", Icon: Mic },
] as const;

/**
 * ランダウンはライト/ダークを切り替えられるので、白前提の配色を固定できない。
 * 置く先の背景に合わせて `tone` を渡す (既定はダーク = OnAir・プロンプター)。
 */
export default function LiveRoleSwitch({
  docId, current, className, tone = "dark",
}: {
  docId: string;
  current: "onair" | "rundown" | "prompter" | "audio";
  className?: string;
  tone?: "dark" | "light";
}) {
  const navigate = useNavigate();
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border p-0.5",
        dark ? "border-white/15" : "border-border",
        className
      )}
      role="group"
      aria-label="本番の役割"
    >
      {ROLES.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => navigate(`/qsheet/live/${docId}?role=${r.id}`)}
          aria-current={current === r.id ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
            current === r.id
              ? dark
                ? "bg-white/20 font-bold text-white"
                : "bg-primary/10 font-bold text-primary"
              : dark
                ? "text-white/60 hover:bg-white/10 hover:text-white"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
          title={r.id === "audio" ? "音声サポートは認証なしの公開URLでも配れます" : undefined}
        >
          <r.Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{r.label}</span>
        </button>
      ))}
    </div>
  );
}
