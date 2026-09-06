/**
 * ④ 設定 / サイネージ（カレンダー・v4）
 *
 * 部屋の前に置く表示機の URL を出します。
 *
 * ── URL は秘密ではないが、配ると誰でも見られる ──────────────
 *
 * サイネージの URL には**トークンが入っていて、ログインなしで開けます**
 * （表示機にログインさせられないため）。つまり
 * **URL を知っている人は、その部屋の予定を全部見られます**。
 * それを画面に書いておかないと、社外の人に気軽に共有されます。
 *
 * トークンを作り直すと**配ってあるURLが全部使えなくなります**
 * （表示機が真っ白になります）。だから作り直しは system_admin だけで、
 * 何が起きるかを確認ダイアログに書きます。
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Monitor, Copy, Check, RefreshCw, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useAuth } from '@/contexts/platform/AuthContext';
import type { FeedsPayload } from './types';

function CopyButton({ url, label }: { url: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      className="w-full justify-start"
      aria-label={`${label} の URL をコピー`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch (e) {
          notifyApiError('コピーできませんでした', e);
        }
      }}
    >
      {done
        ? <><Check className="mr-1.5 h-3.5 w-3.5 text-success" aria-hidden="true" />コピーしました</>
        : <><Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />URL をコピー</>}
    </Button>
  );
}

export function SignageTab({
  data, loading, error, onRetry,
}: {
  data?: FeedsPayload;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  // **作り直せるのは system_admin だけ。** 配ってある URL を全部無効にする操作
  const canRegenerate = currentUser?.role === 'system_admin';

  const regenerate = useMutation({
    mutationFn: () => api.post('/studios/rooms/feeds/regenerate-token'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studio-room-feeds'] });
      notifySuccess('再作成しました', {
        description: '配ってある URL は使えなくなりました。表示機に新しい URL を入れ直してください。',
      });
    },
    onError: (e) => notifyApiError('再作成できませんでした', e),
  });

  const askRegenerate = async () => {
    const ok = await confirmAction({
      title: 'トークンを作り直しますか',
      description: '**いま配ってあるサイネージの URL とカレンダー購読の URL が、すべて使えなくなります。**'
        + '表示機は真っ白になり、外部カレンダーに入れた ONAiR の予定も止まります。'
        + '新しい URL を配り直す用意ができてから押してください。',
      confirmLabel: '作り直す',
      tone: 'danger',
    });
    if (ok) regenerate.mutate();
  };

  if (error) return <ErrorPanel title="サイネージの URL を読み込めませんでした" error={error} onRetry={onRetry} />;
  if (loading) return <Delayed><SkeletonRows rows={4} /></Delayed>;

  const rooms = data?.rooms ?? [];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rounded-card flex items-start gap-2.5 border border-warning-border bg-warning-surface p-3.5">
        <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-note text-secondary-foreground">
          サイネージの URL は<strong className="font-bold">ログインなしで開けます</strong>
          （表示機にログインさせられないため）。
          <strong className="font-bold">URL を知っている人は、その部屋の予定を全部見られます。</strong>
          社外の人に渡さないでください。
        </p>
      </div>

      {data?.calendar_feed_url && (
        <section className="rounded-card border border-border bg-card p-4">
          <h2 className="text-cardtitle">カレンダー購読の URL（全部屋ぶん・1本）</h2>
          <p className="text-note mt-0.5 text-muted-foreground">
            Google / Outlook に入れると、スタジオの予約がそちらにも出ます。
          </p>
          <p className="text-note rounded-note mt-2 break-all bg-muted p-2 text-secondary-foreground">
            {data.calendar_feed_url}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="w-56"><CopyButton url={data.calendar_feed_url} label="カレンダー購読" /></span>
            {canRegenerate && (
              <Button variant="outline" disabled={regenerate.isPending} onClick={askRegenerate}>
                <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />トークンを作り直す
              </Button>
            )}
          </div>
        </section>
      )}

      {rooms.length === 0 ? (
        <EmptyState
          icon={<Monitor className="h-6 w-6" aria-hidden="true" />}
          title="部屋が登録されていません"
          description="部屋を登録すると、その部屋のサイネージ URL がここに出ます。"
        />
      ) : (
        <section className="rounded-card overflow-hidden border border-border bg-card">
          <RowHeader className="hidden sm:flex">
            <RowMain>部屋</RowMain>
            <RowSlot w={128}>開く</RowSlot>
            <RowSlot w={160}>URL</RowSlot>
          </RowHeader>
          {rooms.map((r) => (
            <Row key={r.room_id}>
              <RowMain>
                <RowTitle>{r.room_name}</RowTitle>
                <RowSub>{r.location_name ?? '拠点なし'}</RowSub>
              </RowMain>
              <RowSlot w={128}>
                <a
                  href={r.signage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sub min-h-tap inline-flex items-center gap-1 text-primary underline lg:min-h-[32px]"
                >
                  表示を見る<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </RowSlot>
              <RowSlot w={160}>
                <CopyButton url={r.signage_url} label={r.room_name} />
              </RowSlot>
            </Row>
          ))}
        </section>
      )}
    </div>
  );
}
