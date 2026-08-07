/**
 * ④ 設定 / 外部カレンダー（カレンダー・v4）
 *
 * Google / Outlook の連携と、ICS の購読の**いまの状態**を1枚で出します。
 * 足す・外すは今までの `IcsFeedsDialog` をそのまま開きます。
 *
 * ── 「取れていない」を目立たせる ────────────────────────────
 *
 * ICS は URL が変わったり期限が切れたりして**黙って止まります**。
 * 止まったフィードは予定が増えないだけなので、
 * カレンダーを見ている人は「今日は予定が少ないな」としか思いません。
 * ここでは**最後に取れた時刻とエラーを必ず出します**。
 */
import { useQuery } from '@tanstack/react-query';
import { CalendarSync, Pencil, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import type { IcsFeedRow, OAuthStatus } from './types';

function syncedLabel(iso: string | null): string {
  if (!iso) return 'まだ取れていません';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'まだ取れていません';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'たったいま';
  if (min < 60) return `${min}分前`;
  if (min < 60 * 24) return `${Math.round(min / 60)}時間前`;
  return `${Math.round(min / 1440)}日前`;
}

function OAuthRow({ label, s }: { label: string; s?: OAuthStatus }) {
  if (!s) return null;
  if (!s.configured) {
    return (
      <Row>
        <RowMain>
          <RowTitle>{label}</RowTitle>
          <RowSub>この環境では使えません（連携の設定が入っていません）</RowSub>
        </RowMain>
        <RowSlot w={96}>
          <TableBadge label="使えない" w={null} className="w-full border-transparent bg-muted text-muted-foreground" />
        </RowSlot>
      </Row>
    );
  }
  return (
    <Row align="start">
      <RowMain>
        <RowTitle>{label}</RowTitle>
        <RowSub>
          {s.connected
            ? [s.email, `${s.event_count ?? 0}件`, syncedLabel(s.last_synced_at), s.can_write ? '書き戻しあり' : null]
              .filter(Boolean).join(' ・ ')
            : 'つないでいません'}
        </RowSub>
        {s.last_error && (
          <p className="text-note mt-1 flex items-start gap-1 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {s.last_error}
          </p>
        )}
      </RowMain>
      <RowSlot w={96}>
        <TableBadge
          label={s.connected ? 'つないでいる' : '未接続'}
          w={null}
          className={s.connected
            ? 'w-full border-transparent bg-success-surface text-success'
            : 'w-full border-transparent bg-muted text-muted-foreground'}
        />
      </RowSlot>
    </Row>
  );
}

export function FeedsTab({ onManage }: { onManage: () => void }) {
  const feeds = useQuery({
    queryKey: ['personal-ics-feeds'],
    queryFn: async () => (await api.get('/schedule/feeds')).data.data as IcsFeedRow[],
  });
  const google = useQuery({
    queryKey: ['google-cal-status'],
    queryFn: async () => (await api.get('/schedule/google/status')).data.data as OAuthStatus,
  });
  const outlook = useQuery({
    queryKey: ['ms-cal-status'],
    queryFn: async () => (await api.get('/schedule/ms/status')).data.data as OAuthStatus,
  });

  if (feeds.isLoading) return <Delayed><SkeletonRows rows={4} /></Delayed>;
  const rows = feeds.data ?? [];
  const broken = rows.filter((f) => f.last_error).length;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sub min-w-0 flex-1 text-muted-foreground">
          購読 <span className="font-number font-bold">{rows.length}</span>
          {broken > 0 && <span className="ml-1 text-destructive">・取れていないもの {broken}</span>}
        </p>
        <Button variant="outline" onClick={onManage}>
          <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />連携を管理する
        </Button>
      </div>

      <section className="rounded-card overflow-hidden border border-border bg-card">
        <div className="border-b border-border-faint bg-surface-subtle px-4 py-2.5">
          <h2 className="text-cardtitle">アカウント連携</h2>
        </div>
        <OAuthRow label="Google カレンダー" s={google.data} />
        <OAuthRow label="Outlook（Microsoft 365）" s={outlook.data} />
      </section>

      <section className="rounded-card overflow-hidden border border-border bg-card">
        <div className="border-b border-border-faint bg-surface-subtle px-4 py-2.5">
          <h2 className="text-cardtitle">ICS の購読</h2>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={<CalendarSync className="h-6 w-6" aria-hidden="true" />}
            title="購読はありません"
            description="公開されている ICS の URL を登録すると、その予定が「自分」のレイヤーに出ます。"
          />
        ) : (
          <>
            <RowHeader className="hidden sm:flex">
              <RowMain>名前</RowMain>
              <RowSlot w={96}>件数</RowSlot>
              <RowSlot w={128}>最後に取れた</RowSlot>
            </RowHeader>
            {rows.map((f) => (
              <Row key={f.id} align="start">
                <RowMain>
                  <RowTitle>
                    {f.last_error
                      ? <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-destructive" aria-label="取れていません" />
                      : <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-success" aria-label="取れています" />}
                    {f.label}
                  </RowTitle>
                  {f.last_error && <RowSub className="text-destructive">{f.last_error}</RowSub>}
                </RowMain>
                <RowSlot w={96} hideOnMobile>
                  <span className="font-number text-sub-sm text-secondary-foreground">
                    {f.event_count ?? 0}件
                  </span>
                </RowSlot>
                <RowSlot w={128}>
                  <span className="text-sub-sm text-muted-foreground">{syncedLabel(f.last_synced_at)}</span>
                </RowSlot>
              </Row>
            ))}
          </>
        )}
      </section>

      <p className="text-note text-muted-foreground">
        ICS は URL が変わったり期限が切れたりして<strong className="font-bold">黙って止まります</strong>。
        止まっても予定が増えないだけなので、カレンダーを見ている人は気づけません。
        ここに「最後に取れた」時刻を出しているのはそのためです。
      </p>
    </div>
  );
}
