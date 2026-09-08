// テロップCG — 外部インタラクティブ連携設定（`/techops/graphics/:ownerKey/interactive-link`・段6-7）。
//
// プロジェクト単位で、別VPS（interactive.gmo-onair.jp）との連携先を登録する。
// `RankingSoundsPanel.tsx`（段6-5第2弾）と同じ骨組み（owner解決・戻るリンク・カード1枚）に、
// `LiveOrgSettingsPage.tsx`/`ZoomSettingsSection.tsx` の資格情報入力の体裁（マスク表示・
// 「未入力＝変更しない」・show/hide トグル）を組み合わせた。
//
// **接続テストはこのスコープに含めない。** サーバー側に `listEvents` を叩くテスト専用の
// エンドポイントが無い設計のため（`interactive-bridge.service.ts` の `listEvents` は連携済み
// 設定を前提にした一覧取得であり、保存前の資格情報を検証する専用APIとは別物）。
// 欲しくなったら将来検討——無理に作らない。
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, ChevronLeft, Eye, EyeOff, Link2, Loader2, Unlink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  deleteInteractiveLink, fetchInteractiveLink, saveInteractiveLink,
  type InteractiveLinkInput, type InteractiveLinkState,
} from '@/lib/graphicsInteractiveApi';
import type { OwnerContext } from '@/lib/deviceSettingsApi';
import { useGraphicsProject } from './useGraphicsProject';

const DEFAULT_CLOSE_BUFFER_SECONDS = 5;

function templatesPath(ownerKey: string): string {
  return `/techops/graphics/${encodeURIComponent(ownerKey)}/templates`;
}

export default function InteractiveLinkSettingsPanel() {
  const { ownerKey } = useParams<{ ownerKey: string }>();
  const { state } = useGraphicsProject(ownerKey);

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }
  if (state.status === 'not-found') {
    return (
      <PageShell>
        <EmptyState icon={<Link2 />} title="見つかりませんでした" description="GLS番号が合っているか確かめてください。" />
      </PageShell>
    );
  }
  if (state.status === 'error') {
    return (
      <PageShell>
        <EmptyState icon={<AlertCircle />} title="開けませんでした" description={state.message} />
      </PageShell>
    );
  }

  return (
    <InteractiveLinkContent
      ownerKey={ownerKey ?? ''}
      owner={state.owner}
      projectId={state.bundle.project.id}
    />
  );
}

function interactiveLinkQueryKey(projectId: string) {
  return ['graphics-interactive-link', projectId] as const;
}

/**
 * 設定画面（`GraphicsSettingsPage.tsx`・2026-09-06 再設計・連携タブ）から埋め込みで
 * 再利用するため export した。`RankingSoundsContent` と同じ `embedded` の作法
 * （true のとき外枠・戻るリンク・h1 を出さない）。中身・見た目は一切変えていない。
 */
export function InteractiveLinkContent({ ownerKey, owner, projectId, embedded = false }: {
  ownerKey: string;
  owner: OwnerContext;
  projectId: string;
  embedded?: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = interactiveLinkQueryKey(projectId);
  const linkQuery = useQuery({ queryKey, queryFn: () => fetchInteractiveLink(projectId) });
  const link: InteractiveLinkState | undefined = linkQuery.data;
  const configured = link?.configured === true;

  const [baseUrl, setBaseUrl] = useState('');
  const [apiKeySecret, setApiKeySecret] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [interactiveEventId, setInteractiveEventId] = useState('');
  const [closeBufferSeconds, setCloseBufferSeconds] = useState(String(DEFAULT_CLOSE_BUFFER_SECONDS));
  const [autoControl, setAutoControl] = useState(true);

  // 読み込み完了時に既存値をフォームへ反映（鍵は空欄のまま＝「未入力＝変更しない」）
  useEffect(() => {
    if (!link) return;
    if (link.configured) {
      setBaseUrl(link.baseUrl);
      setInteractiveEventId(link.interactiveEventId);
      setCloseBufferSeconds(String(link.closeBufferSeconds));
      setAutoControl(link.autoControl);
    }
    setApiKeySecret('');
  }, [link]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey });

  const saveMutation = useMutation({
    mutationFn: (input: InteractiveLinkInput) => saveInteractiveLink(projectId, input),
    onSuccess: () => {
      notifySuccess('連携設定を保存しました');
      setApiKeySecret('');
      invalidate();
    },
    onError: () => notifyError('連携設定を保存できませんでした', {
      description: '接続先URL・APIキー・イベントIDを確認してください',
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteInteractiveLink(projectId),
    onSuccess: () => {
      notifySuccess('外部連携を解除しました');
      setBaseUrl(''); setApiKeySecret(''); setInteractiveEventId('');
      setCloseBufferSeconds(String(DEFAULT_CLOSE_BUFFER_SECONDS)); setAutoControl(true);
      invalidate();
    },
    onError: () => notifyError('連携を解除できませんでした'),
  });

  const bufferValid = (() => {
    const n = Number(closeBufferSeconds);
    return Number.isFinite(n) && n >= 0 && n <= 120;
  })();
  const canSave = baseUrl.trim() !== '' && interactiveEventId.trim() !== '' && bufferValid
    && (configured || apiKeySecret.trim() !== ''); // 新規設定は鍵が必須。既存設定は空欄のままでよい

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || saveMutation.isPending) return;
    saveMutation.mutate({
      baseUrl: baseUrl.trim(),
      ...(apiKeySecret.trim() ? { apiKeySecret: apiKeySecret.trim() } : {}),
      interactiveEventId: interactiveEventId.trim(),
      closeBufferSeconds: Math.floor(Number(closeBufferSeconds)),
      autoControl,
    });
  };

  const removeLink = async () => {
    if (!(await confirmAction({
      title: '外部インタラクティブ連携を解除しますか？',
      description: 'このプロジェクトの投票・クイズページは、接続先・APIキーの登録が無い状態に戻ります。個々のページの外部連携（同期済みの設問）は別途「外部連携を解除」してください。',
      confirmLabel: '解除する',
      tone: 'danger',
    }))) return;
    deleteMutation.mutate();
  };

  const body = (
    <>
      {!embedded && (
        <PageHeader
          title={`外部インタラクティブ連携 ／ ${owner.name}`}
          sub={(
            <>
              別VPS（<code className="rounded bg-surface-subtle px-1">interactive.gmo-onair.jp</code>）の
              投票・クイズと連動させるための接続先です。プロジェクト単位の設定で、投票（
              <strong className="font-bold text-foreground">vote</strong> パーツ）のページ編集フォームから
              個別に「外部インタラクティブと同期」できるようになります。
            </>
          )}
        />
      )}
      {embedded && (
        <p className="text-sub text-muted-foreground">
          別VPS（<code className="rounded bg-surface-subtle px-1">interactive.gmo-onair.jp</code>）の
          投票・クイズと連動させる接続先です。投票（<strong className="font-bold text-foreground">vote</strong>）のページ編集フォームから個別に「外部インタラクティブと同期」できます。
        </p>
      )}

      {linkQuery.isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 max-w-xl space-y-4 rounded-card border border-border bg-card p-4">
          {configured ? (
            <p className="flex items-center gap-1.5 text-sub font-bold text-success">
              <Link2 className="h-4 w-4" aria-hidden="true" />設定済み
            </p>
          ) : (
            <p className="text-sub text-muted-foreground">まだ設定されていません。</p>
          )}

          <div>
            <Label htmlFor="interactive-base-url">接続先URL</Label>
            <Input
              id="interactive-base-url"
              className="mt-1 min-h-[44px]"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://interactive.gmo-onair.jp"
            />
          </div>

          <div>
            <Label htmlFor="interactive-api-key">APIキー</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="interactive-api-key"
                type={showKey ? 'text' : 'password'}
                className="min-h-[44px] flex-1"
                value={apiKeySecret}
                onChange={(e) => setApiKeySecret(e.target.value)}
                placeholder={configured ? '設定済み（変更する場合のみ入力）' : '未設定'}
                autoComplete="off"
              />
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? 'APIキーを隠す' : 'APIキーを表示'}>
                {showKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
            {configured && link?.apiKeyPrefix && (
              <p className="mt-1 text-note text-muted-foreground">
                現在の鍵: <code className="rounded bg-surface-subtle px-1">{link.apiKeyPrefix}…</code>（先頭のみ表示）
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="interactive-event-id">イベントID</Label>
            <Input
              id="interactive-event-id"
              className="mt-1 min-h-[44px]"
              value={interactiveEventId}
              onChange={(e) => setInteractiveEventId(e.target.value)}
              placeholder="連携先イベントのID"
            />
          </div>

          <div>
            <Label htmlFor="interactive-close-buffer">締切バッファ（秒・0〜120）</Label>
            <Input
              id="interactive-close-buffer"
              type="number"
              min={0}
              max={120}
              className="mt-1 min-h-[44px] w-32"
              value={closeBufferSeconds}
              onChange={(e) => setCloseBufferSeconds(e.target.value)}
            />
            <p className="mt-1 text-note text-muted-foreground">
              カウントダウン終了後、外部の回答受付を締め切るまでに足す配信ディレイです。
            </p>
            {!bufferValid && (
              <p className="mt-1 text-note font-bold text-destructive">0〜120の範囲で入力してください</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={autoControl} onCheckedChange={setAutoControl} aria-label="カウントダウン連動の自動出題・締切" />
            <div>
              <p className="text-sub font-bold">カウントダウン連動で自動出題・締切する</p>
              <p className="text-note text-muted-foreground">
                オフにすると、テロップCG側の状態変化（自動締切など）を外部へ伝えません（手動運用向け）。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="submit" disabled={!canSave || saveMutation.isPending} className="min-h-[44px]">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : '保存する'}
            </Button>
            {configured && (
              <Button
                type="button" variant="outline" className="min-h-[44px] gap-1.5 text-destructive"
                disabled={deleteMutation.isPending}
                onClick={() => void removeLink()}
              >
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Unlink className="h-4 w-4" aria-hidden="true" />}
                連携を解除する
              </Button>
            )}
          </div>
        </form>
      )}
    </>
  );

  if (embedded) return body;
  return (
    <PageShell>
      <Link
        to={templatesPath(ownerKey)}
        className="inline-flex min-h-tap w-fit items-center gap-1 rounded-control-md px-1.5 text-sub font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        テンプレート管理へ戻る
      </Link>
      {body}
    </PageShell>
  );
}
