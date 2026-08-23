/**
 * ③ 仮押さえ（カレンダー・v4）
 *
 * ── 何のための画面か ────────────────────────────────────────
 *
 * 仮押さえ（`studio_bookings.status='tentative'`）は**放っておくと部屋が塞がったまま**に
 * なります。本番日が近いのに確定していないものから順に、
 * **確定にするか／落とすか**を決めるための一覧です。
 *
 * ── 並びは「本番日までの残り日数」 ──────────────────────────
 *
 * カレンダーの上で見ると、仮押さえは他の予定に埋もれます（色が薄いので余計に）。
 * ここでは**残り日数の少ない順の1本のリスト**にして、
 * 7日を切ったものを赤くします。**日付順ではなく残り日数順**なのは、
 * 過ぎてしまった仮押さえ（本番日が昨日なのに仮のまま）を先頭に出すためです。
 *
 * ── 「落とす」は確認してから ────────────────────────────────
 *
 * 押すと部屋が空きます。**別の案件がその枠を取れる**ようになるので、
 * 取り消しは効きません（同じ枠をもう一度押さえられる保証がない）。
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { invalidateBookingQueries } from '@/lib/bookingQueries';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { PullToRefresh } from '@gmo-onair/shared/src/client-v4/pullToRefresh';
import { useAuth } from '@/contexts/platform/AuthContext';
import { HOLD_KEY, daysLeft, leftTone, leftLabel, type HoldRow } from './holds/holdLogic';
import { HoldCards } from './holds/HoldCards';

type Chip = 'all' | 'soon' | 'later';

/** モックと同じ「45日先まで」。それより先の仮押さえは急いで決める話ではない */
const WINDOW_DAYS = 45;

export default function HoldListPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  // **落とすのは manager から。** `DELETE /studios/bookings/:id` が manager を要求するので、
  // editor に出すと押した先が必ず 403 になる（確定にするほうは editor で通る）
  const canDrop = hasPermission('sales', 'manager');
  const [chip, setChip] = useState<Chip>('all');
  const isMobile = useIsMobile();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const until = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + WINDOW_DAYS);
    return d.toISOString().slice(0, 10);
  }, []);

  const query = useQuery({
    queryKey: HOLD_KEY,
    // **サーバーで仮押さえだけに絞る。** 画面で絞ると、確定ぶんまで運んでから捨てることになる
    // `from` を渡さないと下限が付かず、本番が何ヶ月も前に終わった仮押さえまで
    // 無期限に出続ける（`end_time` が過去のものだけ落とす。本番日を過ぎたのに
    // まだ未確定なもの＝先頭に出したいものは `end_time` が今日以降なので残る）
    queryFn: async () => (await api.get('/studios/bookings', {
      params: { status: 'tentative', from: today, to: until },
    })).data.data as HoldRow[],
  });

  const rows = useMemo(() => {
    const all = (query.data ?? [])
      .map((b) => ({ ...b, left: daysLeft(b.start_time, today) }))
      // **残り日数順**。過ぎてしまった仮押さえ（マイナス）が先頭に来る
      .sort((a, b) => a.left - b.left);
    if (chip === 'soon') return all.filter((b) => b.left <= 14);
    if (chip === 'later') return all.filter((b) => b.left > 14);
    return all;
  }, [query.data, chip, today]);

  const counts = useMemo(() => {
    const all = (query.data ?? []).map((b) => daysLeft(b.start_time, today));
    return {
      all: all.length,
      soon: all.filter((d) => d <= 14).length,
      later: all.filter((d) => d > 14).length,
    };
  }, [query.data, today]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: HOLD_KEY });
    // 予定・部屋の空きにも同じ予約が出る。**片方だけ落とすと古いまま残る**。
    // 仮押さえも実施日として数える種別なので、落とすと**案件の実施日が変わる**
    // （`lib/bookingQueries.ts` が案件詳細・案件一覧まで落とす）
    invalidateBookingQueries(qc);
    qc.invalidateQueries({ queryKey: ['unified-calendar'] });
  };

  const fix = useMutation({
    mutationFn: (id: string) => api.put(`/studios/bookings/${id}`, { status: 'confirmed' }),
    onSuccess: () => { invalidate(); notifySuccess('確定にしました'); },
    onError: (e) => notifyApiError('確定にできませんでした', e),
  });

  const drop = useMutation({
    mutationFn: (id: string) => api.delete(`/studios/bookings/${id}`),
    onSuccess: () => { invalidate(); notifySuccess('落としました。部屋が空きます'); },
    onError: (e) => notifyApiError('落とせませんでした', e),
  });

  const askDrop = async (b: HoldRow & { left: number }) => {
    const ok = await confirmAction({
      title: 'この仮押さえを落としますか',
      description: `「${b.title}」の押さえを外します。**その枠は空きになり、別の案件が取れるようになります。**`
        + '同じ枠をもう一度押さえられる保証はありません。',
      confirmLabel: '落とす',
      tone: 'danger',
    });
    if (ok) drop.mutate(b.id);
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="仮押さえ"
        sub={`${WINDOW_DAYS}日先まで ・ ${counts.all}件（うち2週間以内 ${counts.soon}件）`}
      />

      <FilterChips
        label="いつまでかで絞り込む"
        items={[
          { key: 'all', label: 'すべて', count: counts.all },
          { key: 'soon', label: '2週間以内', count: counts.soon },
          { key: 'later', label: 'それより先', count: counts.later },
        ]}
        value={chip}
        onChange={(k) => setChip(k as Chip)}
      />

      {query.isError ? (
        <ErrorPanel title="仮押さえを読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-6 w-6" aria-hidden="true" />}
          title={chip === 'all' ? '仮押さえはありません' : 'この期間の仮押さえはありません'}
          description="部屋を仮に押さえると、確定するまでここに出ます。放っておくと部屋が塞がったままになります。"
        />
      ) : isMobile ? (
        /*
          **スマホは縦に積む**（M10）。PC の行だと「決める」160px と「あと」72px で
          名前が 150px しか残らず、`検証E 仮…` としか読めませんでした
          （＝何の予約か分からないまま「確定にする」を押させる形）。
        */
        <PullToRefresh onRefresh={query.refetch}>
          <HoldCards
            rows={rows}
            canEdit={canEdit}
            canDrop={canDrop}
            busy={fix.isPending || drop.isPending}
            onFix={(id) => fix.mutate(id)}
            onDrop={askDrop}
          />
        </PullToRefresh>
      ) : (
        <div className="flex flex-col">
          <RowHeader className="hidden sm:flex">
            <RowSlot w={72}>あと</RowSlot>
            <RowMain>予定 ／ 部屋</RowMain>
            <RowSlot w={96}>本番日</RowSlot>
            <RowSlot w={160}>{canEdit ? '決める' : ''}</RowSlot>
          </RowHeader>

          {rows.map((b) => (
            <Row key={b.id} align="start" className={b.left <= 7 ? 'bg-destructive-surface/40' : undefined}>
              {/*
                幅は `TableBadge` の枠 (7段の 72px) に持たせる。以前は
                `RowSlot` の中に `w={null}` で置き、バッジ側に幅いっぱいの指定を
                していたが、枠 (data-badge-slot) が中身の自然幅のままになり、
                「あと12日」のような5字超の行だけ右端がずれていた
                (verify-ui.mjs「バッジの列がそろう」で実測)
              */}
              <TableBadge label={leftLabel(b.left)} w={72} className={leftTone(b.left)} />

              <RowMain>
                <RowTitle>{b.title}</RowTitle>
                <RowSub>
                  {[
                    b.rooms?.map((r) => r.room_abbreviation || r.room_name).join(' ・ ') || '部屋なし',
                    b.gls_number,
                    b.project_name,
                  ].filter(Boolean).join(' ／ ')}
                </RowSub>
              </RowMain>

              <RowSlot w={96} hideOnMobile>
                <span className="font-number text-sub-sm text-secondary-foreground">
                  {b.start_time.slice(5, 10).replace('-', '/')}
                </span>
              </RowSlot>

              <RowSlot w={160}>
                {canEdit && (
                  <span className="flex w-full flex-col gap-1">
                    <Button
                      className="w-full justify-start"
                      disabled={fix.isPending}
                      onClick={() => fix.mutate(b.id)}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />確定にする
                    </Button>
                    {canDrop && (
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      disabled={drop.isPending}
                      onClick={() => askDrop(b)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" aria-hidden="true" />落とす
                    </Button>
                    )}
                  </span>
                )}
              </RowSlot>
            </Row>
          ))}
        </div>
      )}

      <p className="text-note text-muted-foreground">
        並びは<strong className="font-bold">本番日までの残り日数順</strong>です（日付順ではありません）。
        本番日を過ぎてしまった仮押さえが先頭に出ます — 押さえたまま忘れられていた枠がそれです。
      </p>
    </div>
  );
}
