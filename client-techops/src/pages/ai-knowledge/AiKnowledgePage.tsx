// AIナレッジの承認 — `qsheet_ai_knowledge` の一覧・承認・却下・引退（core-redesign-plan.md Phase 2 ④）。
//
// バックエンド（段9・04-ai.md §6-3）は完備済みで、これはその**唯一のUI**。
// これまで承認の道が無く、月次レビューが自動起草した draft が永久に溜まり
// knowledge rev が 0 のままだった（report-ai-map.md 確定不整合3）。
//
// - 閲覧: qsheet reader 以上（サーバーの GET と同じ。reader には操作ボタンを出さない）
// - 操作: qsheet manager 以上（サーバーの PUT が強制。ここでの出し分けは見た目だけ）
// - **draft はプロンプトに絶対載らない**（§6-3 の最重要事項）。承認して active に
//   したときだけ、表全体の rev が1つ進んで以後の生成プロンプトに載る
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, BookOpenCheck } from 'lucide-react';
import { DashboardHeader, EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useAuth } from '@/hooks/useAuth';
import {
  listKnowledge, updateKnowledgeStatus, STATUS_LABELS,
  type KnowledgeRow, type KnowledgeStatus,
} from './knowledgeApi';
import KnowledgeCard from './KnowledgeCard';

const TABS: KnowledgeStatus[] = ['draft', 'active', 'retired'];

/** 状態を変えるときの確認文。どれも「プロンプトへの効き方」が1行で分かる言い方にする */
function confirmMessage(row: KnowledgeRow, next: KnowledgeStatus): string {
  if (next === 'active') {
    return 'このルールを承認して有効にします。ナレッジの版（rev）が1つ進み、次の生成からプロンプトに載ります。よろしいですか？';
  }
  if (row.status === 'active') {
    return 'このルールを引退させます。次の生成からプロンプトに載らなくなります。よろしいですか？';
  }
  return 'この下書きを却下します。プロンプトには載らないまま引退の扱いになります。よろしいですか？';
}

function successMessage(row: KnowledgeRow, next: KnowledgeStatus): string {
  if (next === 'active') return '承認しました。次の生成からプロンプトに載ります';
  return row.status === 'active' ? '引退させました' : '却下しました';
}

export default function AiKnowledgePage() {
  const { hasPermission } = useAuth();
  // 操作（承認・却下・引退）は manager 以上だけ。reader は読み専（サーバー側ゲートと同じ線）
  const canManage = hasPermission('qsheet', 'manager');
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<KnowledgeStatus>('draft');

  const listQuery = useQuery({
    queryKey: ['qsheet-ai-knowledge'],
    queryFn: listKnowledge,
  });

  const byStatus = useMemo(() => {
    const map: Record<KnowledgeStatus, KnowledgeRow[]> = { draft: [], active: [], retired: [] };
    for (const row of listQuery.data ?? []) {
      (map[row.status] ?? map.retired).push(row);
    }
    return map;
  }, [listQuery.data]);

  const statusMutation = useMutation({
    mutationFn: ({ row, status }: { row: KnowledgeRow; status: KnowledgeStatus }) =>
      updateKnowledgeStatus(row.id, status),
    onSuccess: (_updated, { row, status }) => {
      queryClient.invalidateQueries({ queryKey: ['qsheet-ai-knowledge'] });
      notifySuccess(successMessage(row, status));
    },
    onError: (e: unknown) => {
      const message = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      notifyError('状態を変えられませんでした。', message ? { description: message } : { description: '少し待ってから、もう一度お試しください。' });
    },
  });

  const handleChangeStatus = (row: KnowledgeRow, status: KnowledgeStatus) => {
    // client-techops は ConfirmHost 未設置のアプリなので素の confirm() を使う
    // （AudioShareDialog.tsx と同じ判断。confirmAction() は器が無いと黙って false を返す）
    if (!confirm(confirmMessage(row, status))) return; // ui-tokens-ok
    statusMutation.mutate({ row, status });
  };

  const rows = byStatus[tab];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-4">
      <DashboardHeader
        title="AIナレッジの承認"
        description="制作技術支援のAI（当日スケジュール・構成・セリフ・AI に相談）に効かせる明示的なルールの管理です。承認して有効にしたルールだけが、次の生成からプロンプトに載ります（下書きのままでは載りません）。"
      />

      {listQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
        </div>
      ) : listQuery.isError ? (
        <EmptyState
          icon={<BookOpenCheck />}
          title="ナレッジを読み込めませんでした"
          description="時間をおいて再読み込みしてください。"
        />
      ) : (
        <>
          {/* 状態タブ。件数を添えて「承認待ちがいくつ溜まっているか」を一目で分かるようにする */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
            {TABS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTab(s)}
                className={`min-h-tap flex-1 rounded-md px-3 py-1.5 text-sm transition-colors sm:min-h-[38px] ${
                  tab === s
                    ? 'bg-primary/15 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {STATUS_LABELS[s]}（{byStatus[s].length}）
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<BookOpenCheck />}
              title={`${STATUS_LABELS[tab]}のナレッジはありません`}
              description={
                tab === 'draft'
                  ? '月次AIレビューが修正傾向から自動起草するか、APIから人が追加すると、ここに承認待ちとして並びます。'
                  : tab === 'active'
                    ? '下書きを承認すると、ここに並んで生成プロンプトに載ります。'
                    : '却下・引退したルールがここに残ります。'
              }
            />
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <KnowledgeCard
                  key={row.id}
                  row={row}
                  canManage={canManage}
                  busy={statusMutation.isPending}
                  onChangeStatus={handleChangeStatus}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
