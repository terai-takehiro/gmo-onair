// テロップCG — 発注（テロ原）フォーム（`/techops/graphics/:ownerKey/request`）。
//
// docs/design/v4/graphics.md §3・§9 段5「発注（テロ原・スマホ）」。
// ディレクターがスマホから「出したい文言・出すタイミング・種類」だけを投げ込む画面
// （欄を3つに絞る設計。「用途・補足」欄は段Dで削除した — graphics-redesign.md §5⑤）。
// **スマホ最優先** — `pcOnlyScreens.ts` の PC専用リストには入れない（ここだけは
// スマホから完結させる、という graphics.md §3 の分業設計そのもの）。
//
// 送信すると自分の発注が下の一覧に並ぶ（この画面自身が発注フォーム＋一覧を両方持つ —
// モバイルで完結させるための設計）。ハブ画面（PC）の「未作画」列からも同じ一覧に飛べる。
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, FileText, Loader2, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  PART_LABELS,
  createGraphicsRequest, fetchGraphicsRequests, deleteGraphicsRequest,
  type GraphicsPartKey, type GraphicsRequestRow,
} from '@/lib/graphicsApi';
import type { OwnerContext } from '@/lib/deviceSettingsApi';
import { useGraphicsProject } from './useGraphicsProject';
import { RequestStatusBadge } from './badges';
import ScriptPositionPickerDialog from './ScriptPositionPickerDialog';

const NO_PART = '__none__';

export default function RequestFormPage() {
  const { ownerKey } = useParams<{ ownerKey: string }>();
  const { state } = useGraphicsProject(ownerKey);

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }
  if (state.status === 'not-found' || state.status === 'error') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState
          title="開けませんでした"
          description={state.status === 'error' ? state.message : '管理番号が合っているか確かめてください。'}
        />
      </div>
    );
  }

  return (
    <FormContent
      ownerKey={ownerKey ?? ''}
      ownerName={state.owner.name}
      owner={state.owner}
      projectId={state.bundle.project.id}
    />
  );
}

function FormContent({ ownerKey, ownerName, owner, projectId }: {
  ownerKey: string;
  ownerName: string;
  owner: OwnerContext;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const listKey = ['graphics-requests', projectId] as const;

  const [title, setTitle] = useState('');
  const [desiredTiming, setDesiredTiming] = useState('');
  const [desiredPartKey, setDesiredPartKey] = useState<string>(NO_PART);
  const [pickerOpen, setPickerOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: listKey,
    // 'all': 自分が出した発注は却下・ページ化済みも含めて見えるようにする
    // （サーバーの既定は未処理=requestedのみ。RequestQueueSection側は既定のままでよい）
    queryFn: () => fetchGraphicsRequests(projectId, 'all'),
  });
  const requests = listQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => createGraphicsRequest(projectId, {
      title: title.trim(),
      desiredTiming: desiredTiming.trim() || undefined,
      desiredPartKey: desiredPartKey === NO_PART ? undefined : (desiredPartKey as GraphicsPartKey),
    }),
    onSuccess: () => {
      setTitle('');
      setDesiredTiming('');
      setDesiredPartKey(NO_PART);
      notifySuccess('発注を送りました');
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: () => notifyError('発注を送れませんでした'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteGraphicsRequest(id),
    onSuccess: () => {
      notifySuccess('取り消しました');
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: () => notifyError('取り消せませんでした'),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || createMutation.isPending) return;
    createMutation.mutate();
  };

  const withdraw = async (req: GraphicsRequestRow) => {
    if (!(await confirmAction({
      title: `発注「${req.title}」を取り消しますか？`,
      description: 'この発注は削除され、一覧から消えます。',
      confirmLabel: '取り消す',
      tone: 'danger',
    }))) return;
    removeMutation.mutate(req.id);
  };

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to={`/techops/graphics/${encodeURIComponent(ownerKey)}`}
        className="mb-2 inline-flex min-h-tap items-center gap-1 rounded-control-md px-1.5 text-sub font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        テロップCGへ戻る
      </Link>

      <PageHeader
        title="テロップの発注（テロ原）"
        sub={`${ownerName} ／ 文言・出すタイミング・種類だけ書けば大丈夫です`}
      />

      <form onSubmit={submit} className="mt-4 space-y-4 rounded-card border border-border bg-card p-4">
        <div>
          <Label htmlFor="request-title">出したい文言・要旨 <span className="text-destructive">*</span></Label>
          <Input
            id="request-title"
            className="mt-1 min-h-[44px]"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：主催者あいさつ 田島常務"
            autoFocus
          />
        </div>

        <div>
          <Label htmlFor="request-timing">出したいタイミング</Label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <Input
              id="request-timing"
              className="min-h-[44px] sm:flex-1"
              value={desiredTiming}
              onChange={(e) => setDesiredTiming(e.target.value)}
              placeholder="例：オープニング映像の後"
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] w-full sm:w-auto"
              onClick={() => setPickerOpen(true)}
            >
              <FileText className="mr-1 h-4 w-4" aria-hidden="true" />台本から選ぶ
            </Button>
          </div>
        </div>

        <div>
          <Label>希望する部品（任意）</Label>
          <Select value={desiredPartKey} onValueChange={setDesiredPartKey}>
            <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PART}>指定しない</SelectItem>
              {(Object.entries(PART_LABELS) as [GraphicsPartKey, string][]).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          className="min-h-[44px] w-full sm:w-auto"
          disabled={!title.trim() || createMutation.isPending}
        >
          {createMutation.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><Send className="mr-1 h-4 w-4" aria-hidden="true" />送る</>}
        </Button>
      </form>

      <section className="mt-6">
        <h2 className="text-th font-bold text-muted-foreground">自分が出した発注</h2>
        <div className="mt-2 overflow-hidden rounded-card border border-border bg-card">
          {listQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="読み込み中" />
            </div>
          ) : requests.length === 0 ? (
            <EmptyState
              title="発注がまだありません"
              description="上のフォームから送ると、ここに並びます。"
            />
          ) : requests.map((req) => (
            <div key={req.id} className="flex items-start gap-3 border-b border-border-faint px-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="text-list font-bold">{req.title}</p>
                {req.desiredTiming && (
                  <p className="mt-0.5 text-note text-muted-foreground">タイミング: {req.desiredTiming}</p>
                )}
                {req.detail && (
                  <p className="mt-0.5 whitespace-pre-wrap text-note text-muted-foreground">{req.detail}</p>
                )}
              </div>
              <RequestStatusBadge status={req.status} />
              {req.status === 'requested' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`発注「${req.title}」を取り消し`}
                  onClick={() => void withdraw(req)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <ScriptPositionPickerDialog
        owner={owner}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(label) => setDesiredTiming(label)}
      />
    </div>
  );
}
