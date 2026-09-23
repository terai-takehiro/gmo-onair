/**
 * ① ダッシュボード (v4)
 *
 * ── 何を出すか ────────────────────────────────────────────
 *
 * **「押せば片づくもの」だけ**を出します。旧実装は KPI 4枚 ＋ クイックアクション7個 ＋
 * 消耗品の合計 ＋ 要注意 ＋ 貸出中 ＋ メンテの6段で、
 * **ケーブルとコネクタの合計本数をここでも数えていました**
 * (機材台帳が数えているのと同じもの = 同じものを2か所で数えない)。
 *
 * ── 本日・明日の持ち出し・返却 (モックどおり・migration 168) ──────────
 *
 * **持ち出しは予定** (`equipment_lendings.status = 'planned'` ＋ `planned_out_date`)、
 * **入庫は返却予定日**で数えます。貸出の行は持ち出した瞬間に作られるので、
 * 出す予定を `lent_at` で代用すると「まだ出していないのに貸出中」になります。
 *
 * 予定を1件も入れていないうちは 0 が並びます。**それは正しい 0** です
 * (「予定を入れていない」ことが見える)。下の「返してもらう」が実物の一覧です。
 *
 * ── スマホは PC の縮小ではない (v4ネイティブUI化) ──────────────
 *
 * `docs/v4-native-ui-audit-2026-08-20.md` equipment-dashboard の指摘を受けて、
 * **KPI 4枚は PC のグリッドとは別にスマホだけ横に払うウィジェット
 * （`dashboard/KpiRail.tsx`）**、**「返してもらう」「稼働停止中の機材」の
 * 一覧は PC の `Row` とは別にスマホだけ専用カード
 * （`dashboard/LendingCards.tsx` / `MaintenanceCards.tsx`）**にした。
 * 中身（値・並び・行き先）は `dashboard/kpiCells.ts` の `buildKpiCells()` と
 * `dashboard/dueIn.ts` を PC・スマホ両方で共有する — 書き写すと、
 * 片方だけ直したときに同じ画面で数字の意味が食い違う。
 * `useIsMobile()` はこの薄い親で1回だけ呼び、部品ごと入れ替える
 * （`shared/CLAUDE.md`「useIsMobile() で早期 return しない」）。
 */
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRightLeft, Plus, QrCode, Wrench,
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Delayed, EmptyState, ErrorPanel, SkeletonKpi, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { MAINTENANCE_STATUS, MAINTENANCE_TYPE, statusOf } from '@gmo-onair/shared/src/constants/statuses';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { buildKpiCells, type KpiCell } from './dashboard/kpiCells';
import { KpiRail } from './dashboard/KpiRail';
import { LendingCards } from './dashboard/LendingCards';
import { MaintenanceCards } from './dashboard/MaintenanceCards';
import { dueBadgeLabel, dueIn, md } from './dashboard/dueIn';
import type { Stats } from './dashboard/types';

/** 持ち出し・返却の1つ。**0 も出す** — 隠すと「読み込み中」に見える */
function InOut({ label, n }: { label: string; n: number }) {
  return (
    <div className="min-w-0 px-1">
      <p className="text-note truncate text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1">
        {/* 0 は「押せない」ではなく**読ませる値**（＝予定なし）なので、
            薄い文字（白地 2.61:1）ではなく `muted` にする（`tokens.css` の決めごと） */}
        <span className={`font-number text-h2 ${n > 0 ? '' : 'text-muted-foreground'}`}>{n}</span>
        <span className="text-note text-muted-foreground">点</span>
      </p>
    </div>
  );
}

/** KPI 1枚（PC のグリッド）。中身は `KpiRail`（スマホ）と共有の `KpiCell` */
function Tile({ cell }: { cell: KpiCell }) {
  const Icon = cell.icon;
  const toneClass = cell.tone === 'danger' ? 'text-destructive' : cell.tone === 'warning' ? 'text-warning' : 'text-foreground';
  return (
    <Link
      to={cell.to}
      className="min-h-tap flex flex-col gap-2 rounded-card border border-border bg-card p-4 hover:border-primary-border"
    >
      <span className="flex items-center gap-2 text-sub text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />{cell.label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className={`font-number text-h1 ${toneClass}`}>{cell.value.toLocaleString('ja-JP')}</span>
        <span className="text-sub text-muted-foreground">{cell.unit}</span>
      </span>
      <span className="text-note text-muted-foreground">{cell.sub}</span>
    </Link>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const query = useQuery<Stats>({
    queryKey: ['equipment-stats'],
    queryFn: async () => (await api.get('/equipment/stats')).data.data,
    retry: 1,
    staleTime: 60 * 1000,
  });

  const s = query.data;
  const overdueLendings = (s?.recent_lendings ?? []).filter((l) => (dueIn(l.due_date) ?? 99) < 0);
  const soonLendings = (s?.recent_lendings ?? []).filter((l) => (dueIn(l.due_date) ?? 99) >= 0);

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="ダッシュボード"
        sub={s
          ? `常設 ${(s.total_items - s.lent_out).toLocaleString('ja-JP')}点 ・ 修理中 ${s.in_repair}点 ・ 貸出中 ${s.lent_out}点${s.overdue > 0 ? `（返却遅延 ${s.overdue}点）` : ''}`
          : '機材台帳・貸出・メンテナンスの状況'}
        primaryAction={<Button onClick={() => navigate('/equipment/items?view=items')}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />機材を追加
        </Button>}
      >
        <Button variant="outline" asChild>
          <Link to="/equipment/scan"><QrCode className="mr-1 h-4 w-4" aria-hidden="true" />QRスキャン</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/equipment/lendings">
            <ArrowRightLeft className="mr-1 h-4 w-4" aria-hidden="true" />貸出を記録
          </Link>
        </Button>
      </PageHeader>

      {query.isError ? (
        <ErrorPanel title="機材の状況を読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
      ) : !s ? (
        <Delayed><SkeletonKpi /></Delayed>
      ) : (
        <>
          {isMobile ? (
            <KpiRail cells={buildKpiCells(s)} />
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {buildKpiCells(s).map((c) => <Tile key={c.key} cell={c} />)}
            </div>
          )}

          {/* 本日・明日の持ち出し・返却。**4つの数字を1枚に**（モックの並び）。
              押すと貸出・返却の画面へ行く */}
          <section className="rounded-card border border-border bg-card p-4 lg:px-5" aria-labelledby="eq-inout">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h2 id="eq-inout" className="text-cardtitle flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />本日・明日の持ち出し・返却
              </h2>
              <p className="text-note text-muted-foreground">
                持ち出しは登録した予定、返却は返却予定日で数えています
              </p>
              <div className="flex-1" />
              <Link to="/equipment/lendings" className="v4-tap text-sub font-bold text-primary hover:underline">
                貸出・返却へ →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-y-3 lg:grid-cols-4">
              <InOut label="今日 出す" n={s.in_out?.out_today ?? 0} />
              <InOut label="明日 出す" n={s.in_out?.out_tomorrow ?? 0} />
              <InOut label="今日 返る" n={s.in_out?.in_today ?? 0} />
              <InOut label="明日 返る" n={s.in_out?.in_tomorrow ?? 0} />
            </div>
          </section>

          <section className="flex flex-col gap-2" aria-labelledby="eq-overdue">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              <h2 id="eq-overdue" className="shrink-0 text-h2">返却待ち</h2>
              {/* 見出しは折らない。狭いときに縮むのは説明のほう（375px で
                  「返してもら／う」と2行に折れていた） */}
              <span className="truncate text-sub text-muted-foreground">返却期限超過・返却日の近いもの</span>
              <div className="flex-1" />
              <Link to="/equipment/lendings" className="v4-tap shrink-0 text-sub text-primary hover:underline">すべて見る</Link>
            </div>
            {overdueLendings.length + soonLendings.length === 0 ? (
              <EmptyState
                title="返却待ちものはありません"
                description="貸出中の機材はすべて期限内です。"
              />
            ) : isMobile ? (
              <LendingCards rows={[...overdueLendings, ...soonLendings]} />
            ) : (
              <div className="flex flex-col rounded-card border border-border bg-card">
                {[...overdueLendings, ...soonLendings].map((l) => {
                  const days = dueIn(l.due_date);
                  const late = days !== null && days < 0;
                  return (
                    <Row key={l.id} divider stackOnMobile>
                      <RowMain>
                        <RowTitle>{l.equipment_name}{l.unit_number ? ` No.${l.unit_number}` : ''}</RowTitle>
                        <RowSub>
                          {[l.borrower_name, l.project_name, l.gls_number].filter(Boolean).join(' ／ ')}
                        </RowSub>
                      </RowMain>
                      <RowSlot w={96} align="right">
                        <span className="font-number text-sub">返却 {md(l.due_date)}</span>
                      </RowSlot>
                      <RowSlot w={96}>
                        {days === null ? null : (
                          <TableBadge
                            label={dueBadgeLabel(days)}
                            w={null}
                            className={late
                              ? 'bg-destructive-surface text-destructive border-transparent'
                              : days === 0
                                ? 'bg-warning-surface text-warning border-transparent'
                                : 'bg-muted text-muted-foreground border-transparent'}
                          />
                        )}
                      </RowSlot>
                      <RowSlot w={96} align="right" placeholder="">
                        <Button variant="outline" asChild>
                          <Link to="/equipment/lendings">返却を記録</Link>
                        </Button>
                      </RowSlot>
                    </Row>
                  );
                })}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2" aria-labelledby="eq-maint">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <h2 id="eq-maint" className="shrink-0 text-h2">稼働停止中の機材</h2>
              <span className="truncate text-sub text-muted-foreground">修理・点検で使えない状態のもの</span>
              <div className="flex-1" />
              <Link to="/equipment/maintenance" className="v4-tap shrink-0 text-sub text-primary hover:underline">すべて見る</Link>
            </div>
            {query.isLoading ? (
              <Delayed><SkeletonRows rows={3} /></Delayed>
            ) : s.recent_maintenance.length === 0 ? (
              <EmptyState
                title="未対応のメンテナンスはありません"
                description="故障や点検が出たらメンテナンスから記録します。"
              />
            ) : isMobile ? (
              <MaintenanceCards rows={s.recent_maintenance} />
            ) : (
              <div className="flex flex-col rounded-card border border-border bg-card">
                {s.recent_maintenance.map((m) => (
                  <Row key={m.id} divider stackOnMobile>
                    <RowMain>
                      <RowTitle>{m.title}</RowTitle>
                      <RowSub>{m.equipment_name}</RowSub>
                    </RowMain>
                    <RowSlot w={72} hideOnMobile>
                      <span className="text-sub-sm text-muted-foreground">
                        {statusOf(MAINTENANCE_TYPE, m.record_type).label}
                      </span>
                    </RowSlot>
                    <RowSlot w={96}>
                      <TableBadge
                        label={statusOf(MAINTENANCE_STATUS, m.status).label}
                        w={null}
                        className={m.status === 'in_progress'
                          ? 'bg-info-surface text-info border-transparent'
                          : 'bg-warning-surface text-warning border-transparent'}
                      />
                    </RowSlot>
                  </Row>
                ))}
              </div>
            )}
          </section>

          <p className="text-note text-muted-foreground">
            機材は<strong className="font-bold">常設が基本</strong>で、保管場所に紐づきます。
            持ち出せるのは設定の「貸出のルール」で貸出可にした機材だけで、
            貸出・返却・遅延の管理はその機材にだけ働きます。
            <strong className="font-bold">これから持ち出す予定</strong>は、登録されたぶんだけ「本日・明日の持ち出し・返却」に数えています。
          </p>
        </>
      )}
    </div>
  );
}
