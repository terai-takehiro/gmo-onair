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
 * ⚠️ スマホでは出さない（画面が狭いため。スマホの切替は別途検討）。
 * ⚠️ この画面（RecordingPage/StreamingPage）以外への拡張はしない（進行台本・スケジュール表
 * の画面にはこのスイッチャー自体が無い。今回のスコープ外・12-live-timer-decision.md §8-5）。
 */
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { MINI_APP_BY_KEY, externalPathOf, panelPathOf } from "@gmo-onair/shared/src/production/miniapps";
import type { OwnerContext } from "@/lib/deviceSettingsApi";
import ExternalMiniAppLink from "./ExternalMiniAppLink";

export type SwitchKey = "sheet" | "schedule" | "recording" | "streaming" | "liveops";

const ORDER: SwitchKey[] = ["schedule", "sheet", "recording", "streaming", "liveops"];

function pathOf(key: SwitchKey, owner: OwnerContext): string {
  if (key === "sheet") {
    return `/qsheet/sheets?${owner.kind}=${encodeURIComponent(owner.id)}`;
  }
  if (key === "schedule") {
    return `/qsheet/schedules?${owner.kind}=${encodeURIComponent(owner.id)}`;
  }
  if (key === "liveops") {
    // 計時・視聴者は別バンドル（client-live）への本物のページ遷移。qsheet 側の
    // ルーターには一致する route が無いので <Link to> では何も起きない
    // （下の描画側は <Link> を使わず ExternalMiniAppLink＝<a> で出す）
    return externalPathOf(key, owner.id);
  }
  return panelPathOf(key, owner.id);
}

function itemClass(active: boolean) {
  return cn(
    "whitespace-nowrap rounded-control-md px-3 py-1 text-sub",
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
  return (
    <div className="hidden shrink-0 items-center gap-px rounded-control-lg bg-muted p-[3px] sm:inline-flex">
      {ORDER.map((key) => {
        const def = MINI_APP_BY_KEY[key];

        // 計時・視聴者（kind: 'external'）は scope === 'project'（owner.kind === 'project'）
        // のときだけ出す（liveops_programs.project_id は projects テーブルのみを指すため。
        // 12-live-timer-decision.md §3-5）。<Link> をそのまま使うと壊れるので、kind に応じて
        // <Link> と <a> を出し分ける — <a> 側は ExternalMiniAppLink（権限チェック込み）を使う
        if (def.kind === "external") {
          if (owner.kind !== "project") return null;
          return (
            <ExternalMiniAppLink key={key} def={def} ownerId={owner.id} className={itemClass(false)}>
              {def.label}
            </ExternalMiniAppLink>
          );
        }

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
