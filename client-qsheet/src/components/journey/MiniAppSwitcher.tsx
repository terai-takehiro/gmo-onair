/**
 * ヘッダーのミニアプリ切替セグメント（スケジュール表／Qシート／収録設定／配信設定）。
 *
 * 収録設定・配信設定の画面（RecordingPage.tsx / StreamingPage.tsx）は、いったんハブ画面
 * （JourneyPage.tsx の MiniAppTiles）へ戻らないと他のミニアプリへ切り替えられなかった。
 * モックアップ（docs/design/v4/qsheet-v4-coding/mockups/tech-settings/Main.dc.html 43-47行目）
 * はヘッダーに4項目のセグメント切替を持っており、それをここで作る。
 *
 * ラベルは `MINI_APP_BY_KEY` から読む（このファイルに文字列を書き写さない）。
 * レジストリの `label` が変われば自動で追随する。
 *
 * ⚠️ スマホでは出さない（画面が狭いため。スマホの切替は別途検討）。
 */
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { MINI_APP_BY_KEY, panelPathOf } from "@gmo-onair/shared/src/production/miniapps";
import type { OwnerContext } from "@/lib/deviceSettingsApi";

export type SwitchKey = "sheet" | "schedule" | "recording" | "streaming";

const ORDER: SwitchKey[] = ["schedule", "sheet", "recording", "streaming"];

function pathOf(key: SwitchKey, owner: OwnerContext): string {
  if (key === "sheet") {
    return `/qsheet/sheets?${owner.kind}=${encodeURIComponent(owner.id)}`;
  }
  if (key === "schedule") {
    return `/qsheet/schedules?${owner.kind}=${encodeURIComponent(owner.id)}`;
  }
  return panelPathOf(key, owner.id);
}

export default function MiniAppSwitcher({
  owner,
  current,
}: {
  owner: OwnerContext;
  current: SwitchKey;
}) {
  return (
    <div className="hidden shrink-0 items-center gap-px rounded-control-lg bg-muted p-[3px] sm:inline-flex">
      {ORDER.map((key) => {
        const active = key === current;
        return (
          <Link
            key={key}
            to={pathOf(key, owner)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-control-md px-3 py-1 text-sub",
              active
                ? "bg-card font-bold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {MINI_APP_BY_KEY[key].label}
          </Link>
        );
      })}
    </div>
  );
}
