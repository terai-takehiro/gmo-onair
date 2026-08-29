/**
 * ヘッダーのミニアプリ切替セグメント（スケジュール表／Qシート／収録設定／配信設定／計時・視聴者）。
 *
 * 収録設定・配信設定の画面（RecordingPage.tsx / StreamingPage.tsx）は、いったんハブ画面
 * （JourneyPage.tsx の MiniAppTiles）へ戻らないと他のミニアプリへ切り替えられなかった。
 * モックアップ（docs/design/v4/qsheet-v4-coding/mockups/tech-settings/Main.dc.html 43-47行目）
 * はヘッダーに4項目のセグメント切替を持っており、それをここで作る。
 *
 * ラベルは `MINI_APP_BY_KEY` から読む（このファイルに文字列を書き写さない）。
 * レジストリの `label` が変われば自動で追随する。
 *
 * ⚠️ **スマホでも出す**（2026-08-22 修正）。当初は `hidden sm:inline-flex` で PC だけに
 * していたが、監査で「スマホから配信設定へ直接切り替えられない」（ハブまで戻る必要がある）
 * と指摘された。モックはスマホにもセグメントを置いている（Mobile.dc.html）。
 * 狭い画面では**横スクロールできる帯**にして、全項目とも押せるようにする。
 * ⚠️ この画面（RecordingPage/StreamingPage）以外への拡張はしない（進行台本・スケジュール表
 * の画面にはこのスイッチャー自体が無い。今回のスコープ外・12-live-timer-decision.md §8-5）。
 */
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useRail } from "@gmo-onair/shared/src/client-v4/rail";
import { MINI_APP_BY_KEY, panelPathOf } from "@gmo-onair/shared/src/production/miniapps";
import type { OwnerContext } from "@/lib/deviceSettingsApi";

export type SwitchKey = "sheet" | "schedule" | "recording" | "streaming" | "liveops";

const ORDER: SwitchKey[] = ["schedule", "sheet", "recording", "streaming", "liveops"];

function pathOf(key: SwitchKey, owner: OwnerContext): string {
  if (key === "sheet") {
    return `/techops/sheets?${owner.kind}=${encodeURIComponent(owner.id)}`;
  }
  if (key === "schedule") {
    return `/techops/schedules?${owner.kind}=${encodeURIComponent(owner.id)}`;
  }
  return panelPathOf(key, owner.id);
}

function itemClass(active: boolean) {
  return cn(
    // スマホでは指で押すので 44px を確保する（PC は従来どおり詰める）
    "min-h-tap flex items-center whitespace-nowrap rounded-control-md px-3 py-1 text-sub sm:min-h-0",
    active ? "bg-card font-bold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );
}

export default function MiniAppSwitcher({
  owner,
  current,
}: {
  owner: OwnerContext;
  current: SwitchKey;
}) {
  // 狭い画面では帯からあふれる。続きがある側だけ端を溶かして「まだ先がある」を出す
  // （素で切れると、右端の項目が最後だと読めてしまう）
  const rail = useRail();

  return (
    <div
      ref={rail.ref}
      onScroll={rail.onScroll}
      style={rail.style}
      className="-mx-1 flex shrink-0 items-center gap-px overflow-x-auto rounded-control-lg bg-muted p-[3px] sm:mx-0"
    >
      {ORDER.map((key) => {
        const def = MINI_APP_BY_KEY[key];

        // 計時・視聴者は scope === 'project'（owner.kind === 'project'）のときだけ出す
        // （liveops_programs.project_id は projects テーブルのみを指すため。
        // 12-live-timer-decision.md §3-5）。運用画面が client-techops バンドル内
        // （kind: 'panel'）へ移植されたため、他のミニアプリと同じ <Link> で出す
        // （ミニアプリ化フェーズ2・ExternalMiniAppLink は廃止した）。
        if (key === "liveops" && owner.kind !== "project") return null;

        const active = key === current;
        return (
          <Link
            key={key}
            to={pathOf(key, owner)}
            aria-current={active ? "page" : undefined}
            className={itemClass(active)}
          >
            {def.label}
          </Link>
        );
      })}
    </div>
  );
}
