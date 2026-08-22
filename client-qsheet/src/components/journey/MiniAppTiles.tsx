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
 * このタイルだけ件数バッジを持つように作り直した（同日・2度目の改修）:
 * 進行台本・スケジュール表は `days` を平らにした事実から数え、レンタル機材検索は
 * 予約リストを別で取りに行く（`to` の遷移先はどちらも変えていない）。
 */
import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, CalendarDays, Settings2, Package, Timer, ChevronRight } from "lucide-react";
import type { ElementType } from "react";
import { cn } from "@/lib/utils";
import { MINI_APP_BY_KEY, panelPathOf } from "@gmo-onair/shared/src/production/miniapps";
import type { JourneyDay } from "@gmo-onair/shared/src/production/journey";
import { getRentalReservations } from "@/lib/rentalApi";

interface MiniAppTilesProps {
  scope: "project" | "program";
  id: string;
  days: JourneyDay[];
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="font-number inline-flex h-[19px] items-center rounded-badge-xs bg-muted px-1.5 text-badge text-muted-foreground">
      {count}件
    </span>
  );
}

/** タイル共通の見た目 */
const TILE_CLASS =
  "min-h-tap group flex flex-col items-start gap-1.5 rounded-card border border-border bg-card p-3 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function MiniAppTiles({ scope, id, days }: MiniAppTilesProps) {
  const filterKey = scope === "project" ? "project" : "program";

  // sheet / schedule の件数は、同じ資料が複数日に跨って出ることは無い想定だが
  // 念のため id で重複排除する（Set）
  const { sheetCount, scheduleCount } = useMemo(() => {
    const docs = days.flatMap((d) => d.docs);
    const sheetIds = new Set(docs.filter((doc) => doc.app === "sheet").map((doc) => doc.id));
    const scheduleIds = new Set(docs.filter((doc) => doc.app === "schedule").map((doc) => doc.id));
    return { sheetCount: sheetIds.size, scheduleCount: scheduleIds.size };
  }, [days]);

  const rentalQuery = useQuery({
    queryKey: ["qsheet-rental-reservations", id],
    queryFn: () => getRentalReservations(id),
  });
  const rentalCount = rentalQuery.isSuccess
    ? rentalQuery.data.groups.flatMap((g) => g.lines).length
    : null;

  const tiles: { key: string; label: string; description: string; icon: ElementType; to: string; count: number | null }[] = [
    {
      key: "sheet",
      label: MINI_APP_BY_KEY.sheet.label,
      description: "台本づくりと本番進行",
      icon: FileText,
      to: `/qsheet/sheets?${filterKey}=${encodeURIComponent(id)}`,
      count: sheetCount,
    },
    {
      key: "schedule",
      label: MINI_APP_BY_KEY.schedule.label,
      description: "香盤表",
      icon: CalendarDays,
      to: `/qsheet/schedules?${filterKey}=${encodeURIComponent(id)}`,
      count: scheduleCount,
    },
    {
      key: "recording",
      label: MINI_APP_BY_KEY.recording.label,
      description: "収録の機材構成",
      icon: Settings2,
      to: `/qsheet/recording/${encodeURIComponent(id)}`,
      count: null,
    },
    {
      key: "streaming",
      label: MINI_APP_BY_KEY.streaming.label,
      description: "配信先・WEB会議",
      icon: Settings2,
      to: `/qsheet/streaming/${encodeURIComponent(id)}`,
      count: null,
    },
    {
      key: "rental",
      label: MINI_APP_BY_KEY.rental.label,
      description: "機材の横断検索と予約リスト",
      icon: Package,
      to: panelPathOf("rental", id),
      count: rentalCount,
    },
    // 計時・視聴者（liveops）は scope === "project" のときだけ出す（12-live-timer-decision.md
    // §3-1）。liveops_programs.project_id は projects テーブルのみを指し、qsheet 独自の
    // 「番組（マニュアル）」（scope === "program"）には対応しないため。運用画面が
    // client-qsheet バンドル内（kind: 'panel'）へ移植されたため、他のミニアプリと同じ
    // <Link> + panelPathOf で出す（ミニアプリ化フェーズ2・ExternalMiniAppLink は廃止した）。
    ...(scope === "project"
      ? [
          {
            key: "liveops",
            label: MINI_APP_BY_KEY.liveops.label,
            description: "タイマー・視聴者数",
            icon: Timer,
            to: panelPathOf("liveops", id),
            count: null,
          },
        ]
      : []),
  ];

  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <Link
          key={t.key}
          to={t.to}
          className={cn(TILE_CLASS, t.key === "rental" && "col-span-2 sm:col-span-1")}
        >
          <span className="flex w-full items-center justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-control bg-primary-surface-weak text-primary">
              <t.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            {t.count !== null && <CountBadge count={t.count} />}
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
