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
 * ── 本日・明日の入出庫 (モックどおり・migration 168) ──────────
 *
 * **出庫は予定** (`equipment_lendings.status = 'planned'` ＋ `planned_out_date`)、
 * **入庫は返却予定日**で数えます。貸出の行は持ち出した瞬間に作られるので、
 * 出す予定を `lent_at` で代用すると「まだ出していないのに貸出中」になります。
 *
 * 予定を1件も入れていないうちは 0 が並びます。**それは正しい 0** です
 * (「予定を入れていない」ことが見える)。下の「返してもらう」が実物の一覧です。
 */
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRightLeft, ClipboardCheck, Package, Plus, QrCode, Wrench,
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Delayed, EmptyState, ErrorPanel, SkeletonKpi, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { MAINTENANCE_STATUS, MAINTENANCE_TYPE, statusOf } from '@gmo-onair/shared/src/constants/statuses';

interface Stats {
  /** 本日・明日の入出庫 (migration 168)。出庫は予定・入庫は返却予定日 */
  in_out: { out_today: number; out_tomorrow: number; in_today: number; in_tomorrow: number };
  /**
   * ⚠️ **機材台帳の既定表示（子機材を除いた親機材のみ）と揃えてある**
   * （UXレポート 2026-08-18 指摘。以前は子機材込みの全件で、台帳一覧の
   * 「機材 ◯点」と数字が食い違っていた）。子機材込みの総数は
   * `total_items_with_children` を見る
   */
  total_items: number;
  total_items_with_children: number;
  active_items: number;
  in_repair: number;
  lent_out: number;
  overdue: number;
  open_maintenance: number;
  pending_inventory: number;
  recent_lendings: {
    id: string; borrower_name: string; due_date: string | null; lent_at: string;
    equipment_name: string; unit_number: number | null;
    project_name: string | null; gls_number: string | null;
  }[];
  recent_maintenance: {
    id: string; title: string; record_type: string; status: string; equipment_name: string;
  }[];
}

const md = (d: string | null) => (d && d.length >= 10 ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : '—');

/** 入出庫の1つ。**0 も出す** — 隠すと「読み込み中」に見える */
function InOut({ label, n }: { label: string; n: number }) {
  return (
    <div className="min-w-0 px-1">
      <p className="text-note truncate text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1">
        <span className={`font-number text-h2 ${n > 0 ? '' : 'text-fg-disabled'}`}>{n}</span>
        <span className="text-note text-muted-foreground">点</span>
      </p>
    </div>
  );
}

/** 返却予定日から「あと何日 / 何日超過」を出す。日付が無ければ null */
function dueIn(due: string | null): number | null {
  if (!due || due.length < 10) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${due.slice(0, 10)}T00:00:00`);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function Tile({ label, value, unit, sub, tone, icon, to }: {
  label: string; value: number; unit: string; sub: string;
  tone: 'plain' | 'warning' | 'danger'; icon: React.ReactNode; to: string;
}) {
  const toneClass = tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-warning' : 'text-foreground';
  return (
    <Link
      to={to}
      className="min-h-tap flex flex-col gap-2 rounded-card border border-border bg-card p-4 hover:border-primary-border"
    >
      <span className="flex items-center gap-2 text-sub text-muted-foreground">
        {icon}{label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className={`font-number text-h1 ${toneClass}`}>{value.toLocaleString('ja-JP')}</span>
        <span className="text-sub text-muted-foreground">{unit}</span>
      </span>
      <span className="text-note text-muted-foreground">{sub}</span>
    </Link>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
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
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />機材を足す
        </Button>}
      >
        <Button variant="outline" asChild>
          <Link to="/equipment/scan"><QrCode className="mr-1 h-4 w-4" aria-hidden="true" />QRスキャン</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/equipment/lendings">
            <ArrowRightLeft className="mr-1 h-4 w-4" aria-hidden="true" />貸出を登録
          </Link>
        </Button>
      </PageHeader>

      {query.isError ? (
        <ErrorPanel title="機材の状況を読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
      ) : !s ? (
        <Delayed><SkeletonKpi /></Delayed>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="機材" value={s.total_items} unit="点"
              sub={`稼働中 ${s.active_items.toLocaleString('ja-JP')} 点（付属品含む全体 ${s.total_items_with_children.toLocaleString('ja-JP')} 点）`}
              tone="plain" icon={<Package className="h-4 w-4" aria-hidden="true" />}
              to="/equipment/items?view=items"
            />
            <Tile
              label="貸出中" value={s.lent_out} unit="点"
              sub={s.overdue > 0 ? `返却遅延 ${s.overdue} 点` : '返却遅延はありません'}
              tone={s.overdue > 0 ? 'danger' : 'plain'}
              icon={<ArrowRightLeft className="h-4 w-4" aria-hidden="true" />}
              to="/equipment/lendings"
            />
            <Tile
              label="稼働停止中" value={s.in_repair} unit="点"
              sub={`未対応の記録 ${s.open_maintenance} 件`}
              tone={s.open_maintenance > 0 ? 'warning' : 'plain'}
              icon={<Wrench className="h-4 w-4" aria-hidden="true" />}
              to="/equipment/maintenance"
            />
            <Tile
              label="棚卸し" value={s.pending_inventory} unit="件"
              sub="下書き・実施中のもの"
              tone="plain" icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />}
              to="/equipment/inventory"
            />
          </div>

          {/* 本日・明日の入出庫。**4つの数字を1枚に**（モックの並び）。
              押すと貸出・返却の画面へ行く */}
          <section className="rounded-card border border-border bg-card p-4 lg:px-5" aria-labelledby="eq-inout">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h2 id="eq-inout" className="text-cardtitle flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />本日・明日の入出庫
              </h2>
              <p className="text-note text-muted-foreground">
                出庫は登録した予定、入庫は返却予定日で数えています
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
              <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
              <h2 id="eq-overdue" className="text-h2">返してもらう</h2>
              <span className="text-sub text-muted-foreground">返却予定日を過ぎているもの・近いもの</span>
              <div className="flex-1" />
              <Link to="/equipment/lendings" className="v4-tap text-sub text-primary hover:underline">すべて見る</Link>
            </div>
            {overdueLendings.length + soonLendings.length === 0 ? (
              <EmptyState
                title="返してもらうものはありません"
                description="貸出中の機材はすべて期限内です。"
              />
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
                            label={late ? `${-days}日 超過` : days === 0 ? '本日返却' : `あと${days}日`}
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
              <Wrench className="h-4 w-4 text-warning" aria-hidden="true" />
              <h2 id="eq-maint" className="text-h2">稼働停止中の機材</h2>
              <span className="text-sub text-muted-foreground">修理・点検で使えない状態のもの</span>
              <div className="flex-1" />
              <Link to="/equipment/maintenance" className="v4-tap text-sub text-primary hover:underline">すべて見る</Link>
            </div>
            {query.isLoading ? (
              <Delayed><SkeletonRows rows={3} /></Delayed>
            ) : s.recent_maintenance.length === 0 ? (
              <EmptyState
                title="未対応のメンテナンスはありません"
                description="故障や点検が出たらメンテナンスから記録します。"
              />
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
            機材は<strong className="font-bold">常設が基本</strong>で、置き場所に紐づきます。
            持ち出せるのは設定の「貸出の決めごと」で貸出可にした機材だけで、
            貸出・返却・遅延の管理はその機材にだけ働きます。
            <strong className="font-bold">これから出す予定</strong>は記録として持っていないので、この画面には出していません。
          </p>
        </>
      )}
    </div>
  );
}
