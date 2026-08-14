/**
 * 設定 / 拠点・部屋（v4・モックの ②）
 *
 * ── なぜカレンダーの設定と別にあるのか ──────────────────────
 *
 * 拠点（用賀・渋谷…）は**カレンダーだけのものではありません**。
 * migration 172 で**料金表が拠点ごと**になったので、拠点を1つ足すと
 * 「予約できる部屋」と「見積に出る金額」の両方が変わります。
 * カレンダーの設定の中だけに置くと、料金表を触る人がここに辿り着けません。
 *
 * **部屋の一覧は `RoomsTab` をそのまま使います**（カレンダーの設定と同じ部品）。
 * 同じものを2つ実装すると、片方だけ直った日から表示が食い違います。
 * この画面が足しているのは**拠点の段**（部屋数と料金表の品目数）だけです。
 *
 * ── 直せるのは system_admin だけ ────────────────────────────
 *
 * 拠点・部屋の追加/変更/削除は `POST|PUT|DELETE /studios/locations|rooms` で、
 * サーバーは **`requireRole('system_admin')`** を掛けています
 * （`studio` の manager では 403）。**押してから 403 になるのを避けるため、
 * ボタンは system_admin にしか出しません。**
 *
 * ── 料金表の件数は権限がある人にだけ出す ────────────────────
 *
 * `GET /pricing/locations` は `sales` の reader が要ります。権限が無い人に
 * 「0品目」と出すと、**入っているのに見えていないだけ**なのに
 * 「料金が入っていない」と読まれます。列ごと出しません。
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Building2, Pencil, ReceiptJapaneseYen, Info } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { useAuth } from '@/contexts/platform/AuthContext';
import StudioRoomsManagerDialog from '@/contexts/production/components/studio/StudioRoomsManagerDialog';
import { RoomsTab } from '@/contexts/production/pages/calendarSettings/RoomsTab';
import type { LocationRow } from '@/contexts/production/pages/calendarSettings/types';
import { useState } from 'react';

interface PricingLocation {
  id: string;
  name: string;
  category_count: number;
  item_count: number;
}

export default function SitesPage() {
  const { currentUser, hasPermission } = useAuth();
  // **サーバーが system_admin を要求する。** manager に出すと押した先が 403 になる
  const canEdit = currentUser?.role === 'system_admin';
  const canSeePricing = hasPermission('sales');
  const [manageOpen, setManageOpen] = useState(false);

  const locations = useQuery({
    queryKey: ['studio-locations'],
    queryFn: async () => (await api.get('/studios/locations')).data.data as LocationRow[],
    staleTime: 5 * 60_000,
  });

  const pricing = useQuery({
    queryKey: ['pricing-locations'],
    queryFn: async () => (await api.get('/pricing/locations')).data.data as PricingLocation[],
    enabled: canSeePricing,
    staleTime: 5 * 60_000,
  });

  const priceOf = (id: string) => (pricing.data ?? []).find((p) => p.id === id);
  const rows = locations.data ?? [];

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="拠点・部屋"
        sub="予約できる部屋と、見積に出る料金表のもと。ここを直すと、次に作る予約と見積から変わります"
      />

      <p className="rounded-note flex items-start gap-2 border border-info-border bg-info-surface px-3.5 py-3 text-note text-secondary-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <span>
          拠点は<strong className="font-bold">カレンダーと料金表の両方</strong>で使われます。
          拠点を1つ足すと、そこに部屋を作れるようになり、
          <strong className="font-bold">その拠点ぶんの料金表</strong>も別に持てるようになります。
          <strong className="font-bold">略称</strong>は、正式名が長くて入らない狭い枠
          （案件詳細の「会場・スタジオ」など）で正式名の代わりに出ます
          — 「GMOサムライスタジオ用賀」→「<strong className="font-bold">用賀 WORLD STUDIO</strong>」。
          決めていない拠点は<strong className="font-bold">部屋名だけ</strong>になります。
          {!canEdit && <>直せるのは<strong className="font-bold">管理者</strong>だけです。</>}
        </span>
      </p>

      {locations.isError ? (
        <ErrorPanel title="拠点を読み込めませんでした" error={locations.error} onRetry={() => locations.refetch()} />
      ) : locations.isLoading ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" aria-hidden="true" />}
          title="拠点が登録されていません"
          description="拠点を登録すると、その中に部屋を作れるようになります。"
          action={canEdit ? <Button onClick={() => setManageOpen(true)}>拠点と部屋を管理する</Button> : undefined}
        />
      ) : (
        <>
          <section className="rounded-card overflow-hidden border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border-faint bg-surface-subtle px-4 py-2.5">
              <h2 className="text-cardtitle min-w-0 flex-1">拠点</h2>
              {canEdit && (
                <Button variant="outline" onClick={() => setManageOpen(true)}>
                  <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />拠点と部屋を管理する
                </Button>
              )}
            </div>

            <RowHeader className="hidden sm:flex">
              <RowMain>拠点（正式名）</RowMain>
              <RowSlot w={96}>略称</RowSlot>
              <RowSlot w={96}>部屋</RowSlot>
              {canSeePricing && <RowSlot w={160}>料金表</RowSlot>}
            </RowHeader>
            {rows.map((loc) => {
              const p = priceOf(loc.id);
              return (
                <Row key={loc.id}>
                  <RowMain>
                    <RowTitle>{loc.name}</RowTitle>
                    <RowSub>
                      {(loc.rooms ?? []).length === 0
                        ? '部屋がまだありません'
                        : (loc.rooms ?? []).map((r) => r.abbreviation || r.name).join('・')}
                    </RowSub>
                  </RowMain>
                  {/*
                    **略称の対照表**（migration 189）。狭い枠では正式名の代わりに
                    これが出るので、**決めていないことも1行で分かるようにする** —
                    空欄にすると「短く出せる」ことに気づけない
                  */}
                  <RowSlot w={96}>
                    {loc.abbreviation ? (
                      <span className="text-sub font-bold text-foreground">{loc.abbreviation}</span>
                    ) : (
                      <span className="text-sub-sm text-muted-foreground">未設定</span>
                    )}
                  </RowSlot>
                  <RowSlot w={96}>
                    <span className="text-sub font-number text-secondary-foreground">
                      {(loc.rooms ?? []).length} 部屋
                    </span>
                  </RowSlot>
                  {canSeePricing && (
                    <RowSlot w={160}>
                      {/* **読み込み中に「未設定」と書かない。** 入っていないのか
                          まだ読めていないのかは別のこと */}
                      {pricing.isLoading ? (
                        <span className="text-note text-muted-foreground">読み込み中…</span>
                      ) : (p?.item_count ?? 0) === 0 ? (
                        <Link to="/sales/pricing" className="text-sub min-h-tap inline-flex items-center text-primary underline lg:min-h-[32px]">
                          料金は未設定
                        </Link>
                      ) : (
                        <Link
                          to={`/sales/pricing?location=${encodeURIComponent(loc.id)}`}
                          className="text-sub min-h-tap inline-flex items-center gap-1 text-primary underline lg:min-h-[32px]"
                        >
                          <ReceiptJapaneseYen className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="font-number">{p?.item_count}</span> 品目
                        </Link>
                      )}
                    </RowSlot>
                  )}
                </Row>
              );
            })}
          </section>

          {/* **部屋の一覧はカレンダーの設定と同じ部品。** 実装を2つ持たない */}
          <RoomsTab
            locations={rows}
            loading={false}
            canEdit={canEdit}
            onManage={() => setManageOpen(true)}
          />
        </>
      )}

      {manageOpen && (
        <StudioRoomsManagerDialog open onOpenChange={setManageOpen} locations={rows} />
      )}
    </div>
  );
}
