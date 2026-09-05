// テロップCG — 旧リアルタイムCG（client-awards）過去実績データの変換移行ツール（段6-9）。
//
// 旧イベント一覧 → 選択 → プレビュー（警告つき一覧表示） → 「移行する」で確定、の3段フロー。
// `RosterImportDialog.tsx` の preview→commit の設計を踏襲（`AwardsMigrationPreviewPanel.tsx` に
// プレビュー表示を切り出した — ファイルサイズ規律・400行）。
//
// ⚠️ **system_admin限定の管理画面。** 全体のCGプロジェクトを一括作成する破壊力の強い操作
// （旧 `awards_*` の実データが本番に入っているかはこの環境から判定できない——ユーザー指示。
// タスクは「ツールそのもの」の実装であり、本番へ向けて実際に実行する判断はスコープ外）。
// `LiveOrgSettingsPage.tsx` と同じ「文脈に依存しない全体管理」の位置づけで `:ownerKey` を取らない。
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Loader2, ShieldOff, AlertCircle, ArrowRightLeft } from 'lucide-react';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { useAuth } from '@/hooks/useAuth';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  commitAwardsMigration, extractApiErrorMessage, listAwardsMigrationEvents, previewAwardsMigration,
  type AwardsMigrationEventSummary,
} from '@/lib/graphicsAwardsMigrationApi';
import AwardsMigrationPreviewPanel from './AwardsMigrationPreviewPanel';

const STATUS_LABELS: Record<string, string> = { draft: '準備中', live: '開催中', closed: '終了済み' };

export default function AwardsMigrationPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const isSystemAdmin = currentUser?.role === 'system_admin';

  const Header = (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
        aria-label="戻る"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h1 className="text-sm font-bold">テロップCG — 過去実績の移行ツール（旧リアルタイムCG）</h1>
    </div>
  );

  if (!isSystemAdmin) {
    return (
      <div className="flex h-full flex-col">
        {Header}
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <ShieldOff className="h-5 w-5" />
          <span className="text-sm">この画面はシステム管理者だけが開けます</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {Header}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl">
          <p className="mb-4 text-sub text-muted-foreground">
            旧リアルタイムCG（<code className="rounded bg-surface-subtle px-1">client-awards</code>）の
            イベント・カテゴリ・エントリーを、新しいテロップCG（ランキング発表部品）へコピーします。
            元データは変更しません——複製して新規作成するだけです。
          </p>
          <MigrationBody />
        </div>
      </div>
    </div>
  );
}

function MigrationBody() {
  const queryClient = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  const eventsQuery = useQuery({
    queryKey: ['awards-migration-events'],
    queryFn: listAwardsMigrationEvents,
  });

  const previewQuery = useQuery({
    queryKey: ['awards-migration-preview', selectedEventId],
    queryFn: () => previewAwardsMigration(selectedEventId!),
    enabled: selectedEventId !== null,
  });

  const commitMutation = useMutation({
    mutationFn: (eventId: number) => commitAwardsMigration(eventId),
    onSuccess: (result) => {
      notifySuccess('移行が完了しました', {
        description: `テロップCG に ${result.pageIds.length}件のページを作りました`,
      });
      void queryClient.invalidateQueries({ queryKey: ['awards-migration-preview', selectedEventId] });
    },
    onError: (e: unknown) => {
      notifyError('移行できませんでした', { description: extractApiErrorMessage(e) });
    },
  });

  if (eventsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }

  if (eventsQuery.isError) {
    return (
      <div className="flex items-center gap-2 py-8 text-destructive">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />一覧を読み込めませんでした
      </div>
    );
  }

  const events = eventsQuery.data ?? [];

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<ArrowRightLeft />}
        title="移行元のイベントがありません"
        description="旧リアルタイムCG（awards_events）にイベントが1件もありません。"
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-card border border-border">
        <div className="flex items-center gap-3 border-b border-border-faint bg-surface-subtle px-4 py-2 text-th text-muted-foreground">
          <span className="min-w-0 flex-1">イベント</span>
          <span className="w-16 shrink-0 text-center">状態</span>
          <span className="w-20 shrink-0 text-center">カテゴリ</span>
          <span className="w-20 shrink-0 text-center">エントリー</span>
        </div>
        {events.map((ev: AwardsMigrationEventSummary) => (
          <button
            key={ev.id}
            type="button"
            onClick={() => setSelectedEventId(ev.id)}
            className={`flex w-full items-center gap-3 border-b border-border-faint px-4 py-2.5 text-left last:border-b-0 hover:bg-surface-subtle ${
              selectedEventId === ev.id ? 'bg-primary-surface-weak' : ''
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-list font-bold">{ev.name}</span>
              {ev.subtitle && <span className="block truncate text-note text-muted-foreground">{ev.subtitle}</span>}
            </span>
            <span className="w-16 shrink-0 text-center text-sub text-muted-foreground">{STATUS_LABELS[ev.status] ?? ev.status}</span>
            <span className="font-number w-20 shrink-0 text-center text-sub">{ev.categoryCount}本</span>
            <span className="font-number w-20 shrink-0 text-center text-sub">{ev.entryCount}件</span>
          </button>
        ))}
      </section>

      {selectedEventId !== null && (
        <AwardsMigrationPreviewPanel
          preview={previewQuery.data ?? null}
          loading={previewQuery.isLoading}
          error={previewQuery.isError}
          committing={commitMutation.isPending}
          onCommit={() => commitMutation.mutate(selectedEventId)}
        />
      )}
    </div>
  );
}
