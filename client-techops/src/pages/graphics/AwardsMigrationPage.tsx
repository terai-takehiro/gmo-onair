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
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
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

  // 画面の名前は `<PageHeader>` に寄せた（`_rules.md`「5. ページの外枠」）。
  // 以前はこの画面だけ自前の上辺バー（`border-b bg-card` ＋ 14px の `<h1>`）を持っており、
  // 共通シェルのヘッダーと二重になっていた
  const header = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex h-9 w-9 min-h-tap shrink-0 items-center justify-center rounded-control-md hover:bg-muted"
        aria-label="戻る"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <PageHeader className="min-w-0 flex-1" title="旧リアルタイムCGから移す" />
    </div>
  );

  if (!isSystemAdmin) {
    return (
      <PageShell width="narrow">
        {header}
        <div className="flex items-center gap-2 text-muted-foreground">
          <ShieldOff className="h-5 w-5" />
          <span className="text-sub">この画面はシステム管理者だけが開けます</span>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell width="narrow">
      {header}
      <p className="text-sub text-muted-foreground">
        旧リアルタイムCGのイベント・賞（カテゴリ）・エントリーを、いまのテロップCG（ランキング発表）へ
        コピーします。旧データは読むだけで書き換えません——複製して新しく作るだけです。
      </p>
      <MigrationBody />
    </PageShell>
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
        description: `テロップCG に ${result.pageIds.length}件のテロップを作りました`,
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
        description="旧リアルタイムCGにイベントが1件もありません。"
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
