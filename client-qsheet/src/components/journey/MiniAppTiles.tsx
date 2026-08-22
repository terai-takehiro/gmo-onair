/**
 * ミニアプリのタイル。案件・番組（マニュアル）どちらのハブ（`JourneyPage.tsx`）でも同じ形。
 *
 * 進行台本・スケジュール表は**一覧を絞り込んだ形**（`?project=` / `?program=`）で開く
 * — 「案件が見えていない」ではなく「その案件の分だけ見せる」ため（`SheetListPage.tsx` /
 * `ScheduleListPage.tsx` が読む）。収録設定・配信設定は一覧を持たない道具
 * （`kind: 'panel'`）なので、`panelPathOf` で直接その番組・案件の設定画面へ送る
 * （`DeviceSettingsHome.tsx` の GLS番号入力を経由しない — ここでは owner が既に分かっている）。
 *
 * `JourneyPage.tsx` から抽出（2026-08-22・見た目の作り直しに向けて分離）。
 * 元の実装から動作は変えていない。
 */
import { Link } from "react-router-dom";
import { FileText, CalendarDays, Settings2, Package, ChevronRight } from "lucide-react";
import type { ElementType } from "react";
import { MINI_APP_BY_KEY, panelPathOf } from "@gmo-onair/shared/src/production/miniapps";

interface MiniAppTilesProps {
  scope: "project" | "program";
  id: string;
}

export default function MiniAppTiles({ scope, id }: MiniAppTilesProps) {
  const filterKey = scope === "project" ? "project" : "program";
  const tiles: { key: string; label: string; description: string; icon: ElementType; to: string }[] = [
    {
      key: "sheet",
      label: MINI_APP_BY_KEY.sheet.label,
      description: "台本づくりと本番進行",
      icon: FileText,
      to: `/qsheet/sheets?${filterKey}=${encodeURIComponent(id)}`,
    },
    {
      key: "schedule",
      label: MINI_APP_BY_KEY.schedule.label,
      description: "香盤表",
      icon: CalendarDays,
      to: `/qsheet/schedules?${filterKey}=${encodeURIComponent(id)}`,
    },
    {
      key: "recording",
      label: MINI_APP_BY_KEY.recording.label,
      description: "収録の機材構成",
      icon: Settings2,
      to: `/qsheet/recording/${encodeURIComponent(id)}`,
    },
    {
      key: "streaming",
      label: MINI_APP_BY_KEY.streaming.label,
      description: "配信先・WEB会議",
      icon: Settings2,
      to: `/qsheet/streaming/${encodeURIComponent(id)}`,
    },
    {
      key: "rental",
      label: MINI_APP_BY_KEY.rental.label,
      description: "機材の横断検索と予約リスト",
      icon: Package,
      to: panelPathOf("rental", id),
    },
  ];

  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {tiles.map((t) => (
        <Link
          key={t.key}
          to={t.to}
          className="min-h-tap group flex flex-col items-start gap-1.5 rounded-card border border-border bg-card p-3 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-control bg-primary-surface-weak text-primary">
            <t.icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex items-center gap-1">
            <span className="text-sub font-bold">{t.label}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </span>
          <span className="text-sub-sm text-muted-foreground">{t.description}</span>
        </Link>
      ))}
    </div>
  );
}
