/**
 * EquipmentDailyPage — 機材 ＞ 日々 (§4.16 / デザイン 17b)
 *
 * 現場が毎日開く画面。**ダッシュボードという独立メニューをやめてここに統合**した。
 * 上から 返ってきていないもの (その場で返却記録) → 今日と明日の出し入れ → 直しているもの、
 * 右に 棚卸しの進捗 / 種別ごとの在庫 / よく使う操作。
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MAINTENANCE_STATUS, MAINTENANCE_TYPE, statusOf } from "@gmo-onair/shared/src/constants/statuses";
import { KpiCard, SectionCard } from "@gmo-onair/shared/src/client/dashboard";
import {
  Package,
  ArrowRightLeft,
  Wrench,
  AlertTriangle,
  Plus,
  RefreshCw,
  ChevronRight,
  Clock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Server,
  QrCode,
  Cable,
  Plug,
} from "lucide-react";
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';

// ステータス定義は shared/src/constants/statuses.ts に一元化済み (v2.4.0)

const TYPE_LABEL: Record<string, string> = {
  V: "映像", C: "カメラ", A: "音声", IC: "インカム", NW: "ネットワーク", L: "照明", XR: "XR", E: "電源", "?": "未分類",
};

export default function EquipmentDailyPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["equipment-stats"],
    queryFn: async () => (await api.get("/equipment/stats")).data.data,
    retry: 1,
    staleTime: 60 * 1000,
  });

  const { data: cablesData } = useQuery({
    queryKey: ["equipment-cables"],
    queryFn: async () => (await api.get("/equipment/cables")).data.data as Array<{ quantity: number }>,
    staleTime: 60 * 1000,
  });
  const { data: connectorsData } = useQuery({
    queryKey: ["equipment-connectors"],
    queryFn: async () => (await api.get("/equipment/connectors")).data.data as Array<{ quantity: number }>,
    staleTime: 60 * 1000,
  });
  const cableTypes = cablesData?.length ?? 0;
  const cableTotal = (cablesData ?? []).reduce((s, c) => s + (Number(c.quantity) || 0), 0);
  const connectorTypes = connectorsData?.length ?? 0;
  const connectorTotal = (connectorsData ?? []).reduce((s, c) => s + (Number(c.quantity) || 0), 0);

  const refreshButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => refetch()}
      disabled={isFetching}
      aria-label="データ更新"
    >
      <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
      更新
    </Button>
  );

  const markReturned = useMutation({
    mutationFn: async (lendingId: string) =>
      api.put(`/equipment/lendings/${lendingId}/return`, { returned_at: new Date().toISOString() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment-stats"] }),
  });

  if (isLoading) {
    return (
      <Delayed><SkeletonRows rows={6} /></Delayed>
    );
  }

  if (isError) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          title="データを取得できませんでした"
          description="ネットワーク接続を確認し、再試行してください。"
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />再試行
            </Button>
          }
        />
      </div>
    );
  }

  const stats = data || {};
  const recentMaintenance: any[] = stats.recent_maintenance || [];
  const overdueLendings: any[] = stats.overdue_lendings || [];
  const todayMoves: any[] = stats.today_moves || [];
  const byType: any[] = stats.by_type || [];
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">機材 ＞ 日々</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-secondary-foreground">
            貸出中 <span className="font-bold tabular-nums text-foreground">{stats.lent_out ?? 0}点</span>
            <span aria-hidden="true">・</span>
            <span className={overdueLendings.length > 0 ? "text-destructive" : undefined}>
              返却遅延 <span className="font-bold tabular-nums">{overdueLendings.length}点</span>
            </span>
            <span aria-hidden="true">・</span>
            修理中 <span className="font-bold tabular-nums text-foreground">{stats.in_repair ?? 0}点</span>
            <span aria-hidden="true">・</span>
            今日の出し入れ <span className="font-bold tabular-nums text-foreground">
              {todayMoves.filter((m) => String(m.on_date).slice(0, 10) === todayKey).length}件
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate("/equipment/scan")}>
            <QrCode className="h-4 w-4" aria-hidden="true" />
            QRで読む
          </Button>
          <Button size="sm" className="gap-1" onClick={() => navigate("/equipment/lendings")}>
            <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
            貸し出す
          </Button>
          {refreshButton}
        </div>
      </header>

      {/* ── 返ってきていないもの / 今日と明日の出し入れ / 直しているもの ── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6">
        <div className="min-w-0 space-y-5">
          {/* 返ってきていないもの */}
          <SectionCard
            title="返ってきていないもの"
            description="返却予定日を過ぎています。ここで返却を記録できます。"
            icon={<AlertTriangle />}
            footnote={`${overdueLendings.length} 点`}
          >
            {overdueLendings.length === 0 ? (
              <EmptyState title="返却遅延はありません" />
            ) : (
              <ul className="divide-y divide-border">
                {overdueLendings.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <span className="shrink-0 font-number text-[12px] text-primary">{o.eq_code || "—"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-foreground">{o.equipment_name}</span>
                      <span className="block truncate text-[12px] text-secondary-foreground">
                        {[o.borrower_name, o.project_name].filter(Boolean).join(" ・ ") || "貸出先 未記録"}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-destructive">
                      {o.days_late}日 超過
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 text-[12px]"
                      disabled={markReturned.isPending}
                      onClick={() => markReturned.mutate(o.id)}
                    >
                      返却を記録
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* 今日と明日の出し入れ */}
          <SectionCard
            title="今日と明日の出し入れ"
            description="貸出の日付から自動で出しています。"
            icon={<CalendarDays />}
            footnote={`${todayMoves.length} 件`}
          >
            {todayMoves.length === 0 ? (
              <EmptyState title="今日と明日の出し入れはありません" />
            ) : (
              <ul className="divide-y divide-border">
                {todayMoves.map((m, i) => {
                  const isToday = String(m.on_date).slice(0, 10) === todayKey;
                  return (
                    <li key={`${m.kind}-${m.id}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                      <Badge
                        className="shrink-0 text-[11px]"
                        variant={m.kind === "out" ? "default" : "secondary"}
                      >
                        {m.kind === "out" ? "出庫" : "返却"}
                      </Badge>
                      <span className="shrink-0 text-[12px] tabular-nums text-secondary-foreground">
                        {isToday ? "今日" : "明日"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-foreground">{m.equipment_name}</span>
                        <span className="block truncate text-[12px] text-secondary-foreground">
                          {[m.project_name, m.borrower_name].filter(Boolean).join(" ・ ") || "—"}
                        </span>
                      </span>
                      <span className="shrink-0 font-number text-[12px] text-primary">{m.eq_code || ""}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* 右: 棚卸し / 種別ごとの在庫 */}
        <div className="min-w-0 space-y-5">
          <SectionCard
            title="棚卸し"
            description={
              (stats.pending_inventory ?? 0) > 0
                ? "実施中の棚卸しがあります。QRで読むと ✓ が付きます。"
                : "実施中の棚卸しはありません。"
            }
            icon={<ClipboardCheck />}
          >
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tabular-nums text-foreground">{stats.pending_inventory ?? 0}</span>
              <span className="text-[13px] text-secondary-foreground">件 実施中</span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => navigate("/equipment/inventory")}
              >
                棚卸しを開く
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="種別ごとの在庫" description="括弧の中は貸出中の数です。" icon={<Package />}>
            {byType.length === 0 ? (
              <EmptyState title="機材が登録されていません" />
            ) : (
              <ul className="space-y-1.5">
                {byType.map((t) => {
                  const pct = t.total > 0 ? Math.round((t.lent / t.total) * 100) : 0;
                  return (
                    <li key={t.type} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 truncate text-[13px] text-foreground">
                        {TYPE_LABEL[t.type] ?? t.type}
                      </span>
                      <span className="h-4 flex-1 overflow-hidden rounded bg-secondary">
                        <span className="block h-full rounded bg-primary/70" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-20 shrink-0 text-right text-[12px] tabular-nums text-secondary-foreground">
                        {t.total}（{t.lent}）
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      {/* 主要指標 */}
      <section aria-labelledby="equipment-kpi-heading">
        <h2 id="equipment-kpi-heading" className="sr-only">機材の主要指標</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="総機材数"
            icon={<Package />}
            value={stats.total_items ?? 0}
            unit="件"
            footnote={`稼働中 ${stats.active_items ?? 0} 件`}
            onClick={() => navigate("/equipment/items")}
          />
          <KpiCard
            label="貸出中"
            icon={<ArrowRightLeft />}
            value={stats.lent_out ?? 0}
            unit="件"
            emphasis={(stats.overdue ?? 0) > 0 ? "warning" : "info"}
            footnote={(stats.overdue ?? 0) > 0 ? `遅延 ${stats.overdue} 件` : "遅延なし"}
            onClick={() => navigate("/equipment/lendings")}
          />
          <KpiCard
            label="修理・メンテ中"
            icon={<Wrench />}
            value={stats.in_repair ?? 0}
            unit="件"
            emphasis={(stats.open_maintenance ?? 0) > 0 ? "negative" : "success"}
            footnote={`未対応 ${stats.open_maintenance ?? 0} 件`}
            onClick={() => navigate("/equipment/maintenance")}
          />
          <KpiCard
            label="棚卸し"
            icon={<ClipboardCheck />}
            value={stats.pending_inventory ?? 0}
            unit="件"
            emphasis="info"
            footnote="未完了の棚卸し"
            onClick={() => navigate("/equipment/inventory")}
          />
        </div>
      </section>

      {/* クイックアクション */}
      <SectionCard title="クイックアクション" description="よく使う操作を1タップで。" padding="compact">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <Button variant="outline" className="h-12 gap-2 justify-start px-4" onClick={() => navigate("/equipment/lendings")}>
            <Plus className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-sm">貸出登録</span>
          </Button>
          <Button variant="outline" className="h-12 gap-2 justify-start px-4" onClick={() => navigate("/equipment/maintenance")}>
            <Plus className="h-4 w-4 text-warning shrink-0" aria-hidden="true" />
            <span className="text-sm">メンテ記録</span>
          </Button>
          <Button variant="outline" className="h-12 gap-2 justify-start px-4" onClick={() => navigate("/equipment/items")}>
            <Package className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-sm">機材一覧</span>
          </Button>
          <Button variant="outline" className="h-12 gap-2 justify-start px-4" onClick={() => navigate("/equipment/cables")}>
            <Cable className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-sm">ケーブル管理</span>
          </Button>
          <Button variant="outline" className="h-12 gap-2 justify-start px-4" onClick={() => navigate("/equipment/connectors")}>
            <Plug className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-sm">コネクタ管理</span>
          </Button>
          <Button variant="outline" className="h-12 gap-2 justify-start px-4" onClick={() => navigate("/equipment/scan")}>
            <QrCode className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
            <span className="text-sm">QRスキャン</span>
          </Button>
          <Button variant="outline" className="h-12 gap-2 justify-start px-4" onClick={() => navigate("/equipment/racks")}>
            <Server className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="text-sm">ラック実装</span>
          </Button>
        </div>
      </SectionCard>

      {/* 消耗品サマリー: ケーブル + コネクタ */}
      <section aria-labelledby="equipment-supplies-heading">
        <h2 id="equipment-supplies-heading" className="sr-only">消耗品の在庫サマリー</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KpiCard
            label="ケーブル"
            icon={<Cable />}
            value={cableTotal}
            unit="本"
            footnote={`${cableTypes} 種類`}
            emphasis="info"
            onClick={() => navigate("/equipment/cables")}
          />
          <KpiCard
            label="コネクタ"
            icon={<Plug />}
            value={connectorTotal}
            unit="個"
            footnote={`${connectorTypes} 種類`}
            emphasis="info"
            onClick={() => navigate("/equipment/connectors")}
          />
        </div>
      </section>

      {/* アラート (要注意) */}
      {((stats.overdue ?? 0) > 0 || (stats.open_maintenance ?? 0) > 0) && (
        <SectionCard
          title="要注意"
          description="対応が必要な項目です。タップで該当一覧へ。"
          icon={<AlertTriangle />}
          padding="compact"
        >
          <div className="space-y-2">
            {(stats.overdue ?? 0) > 0 && (
              <button
                type="button"
                className="w-full flex items-center gap-2 text-sm text-warning bg-warning/10 rounded-md p-3 hover:bg-warning/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => navigate("/equipment/lendings")}
              >
                <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">返却期限超過が {stats.overdue} 件あります</span>
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            )}
            {(stats.open_maintenance ?? 0) > 0 && (
              <button
                type="button"
                className="w-full flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3 hover:bg-destructive/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => navigate("/equipment/maintenance")}
              >
                <Wrench className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">未対応のメンテナンスが {stats.open_maintenance} 件あります</span>
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            )}
          </div>
        </SectionCard>
      )}

      {/* 最近のメンテナンス */}
      {recentMaintenance.length > 0 && (
        <SectionCard
          title={`未対応メンテナンス (${stats.open_maintenance ?? 0} 件)`}
          icon={<Wrench />}
          actions={
            <button
              type="button"
              className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              onClick={() => navigate("/equipment/maintenance")}
            >
              すべて表示
            </button>
          }
          padding="compact"
        >
          <ul className="space-y-2">
            {recentMaintenance.map((m: any) => (
              <li
                key={m.id}
                className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-muted/40 text-sm"
              >
                <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{m.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.equipment_name}</p>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <Badge variant={statusOf(MAINTENANCE_STATUS, m.status).variant} className="text-xs">
                    {statusOf(MAINTENANCE_STATUS, m.status).label}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {statusOf(MAINTENANCE_TYPE, m.record_type).label}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* 空状態 */}
      {(stats.total_items ?? 0) === 0 && (
        <SectionCard title="機材を登録しましょう">
          <EmptyState
            icon={<CheckCircle2 />}
            title="まだ機材が登録されていません"
            description="機材を登録すると、ここに統計情報と貸出・メンテ一覧が表示されます。"
            action={
              <Button size="sm" onClick={() => navigate("/equipment/items")}>
                <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                機材を追加
              </Button>
            }
          />
        </SectionCard>
      )}
    </div>
  );
}
