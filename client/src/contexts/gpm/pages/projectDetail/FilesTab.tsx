/**
 * ③ プロジェクト詳細 ／ 書類 (v4 GPM)
 *
 * ── フォルダは押したときだけ作る ────────────────────────────
 *
 * **BOX に作ったフォルダは ONAiR からは消せません**（人が手で消すことになる）。
 * なのでプロジェクトを作った流れでは作らず、この画面で
 * **何ができるかを先に見せてから**押してもらいます。
 *
 * ── 案件（GLS）とは別の構成 ──────────────────────────────────
 *
 * 案件は 01_見積・提案 / 04_Qシート / 05_台本・進行表 … と放送の仕事の形ですが、
 * プロジェクトは設備の構築なので置くものが違います（図面・仕様書・工程表）。
 * 構成は `server/src/contexts/gpm/services/gpm-box-folder.service.ts` が正で、
 * ここはサーバーから取ってきて出すだけです（写すと片方だけ古くなる）。
 *
 * ── 中のファイルは出しません ────────────────────────────────
 *
 * 案件詳細の書類タブは1階層ぶんのファイルを出しますが、こちらは
 * **フォルダを開くリンクだけ**です。GPM 用のファイル一覧の口がまだサーバーに
 * ありません。無いものを空の一覧として出すと「1件も無い」と読まれます。
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink, FolderPlus, Lock, Users } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useInvalidateGpm } from '../../queries';
import type { GpmProjectDetail } from '../../types';

interface Preview { internal: string[]; external: string[] }

export function FilesTab({ project, canEdit }: { project: GpmProjectDetail; canEdit: boolean }) {
  const invalidate = useInvalidateGpm();
  const has = !!(project.box_url_internal || project.box_url_external);

  // 何が作られるかはサーバーが持っている。**画面に書き写さない**
  const preview = useQuery({
    queryKey: ['gpm-box-preview'],
    queryFn: async () => (await api.get(`/gpm/projects/${project.id}/box-preview`)).data.data as Preview,
    enabled: !has,
    staleTime: 60 * 60 * 1000,
  });

  const create = useMutation({
    mutationFn: () => api.post(`/gpm/projects/${project.id}/box-folder`),
    onSuccess: () => { invalidate(project.id); notifySuccess('BOX にフォルダを作りました'); },
    onError: (e) => notifyApiError('BOX にフォルダを作れませんでした', e),
  });

  const onCreate = async () => {
    const p = preview.data;
    const ok = await confirmAction({
      title: `「${project.name}」の BOX フォルダを作りますか？`,
      description: [
        '**本番の BOX に実際にフォルダができます。ONAiR からは消せません**（消すときは BOX で手で消します）。',
        p ? `社内限り: ${p.internal.join(' / ')}` : '',
        p ? `社外共有可: ${p.external.join(' / ')}` : '',
        '社内限りには仕入値と発注書を置きます（発注者にも PM 会社にも見せません）。',
      ].filter(Boolean).join('\n'),
      confirmLabel: 'フォルダを作る',
    });
    if (ok) create.mutate();
  };

  if (!has) {
    return (
      <EmptyState
        icon={<FolderPlus className="h-6 w-6" aria-hidden="true" />}
        title="BOX フォルダはまだ作っていません"
        description={
          preview.data
            ? `作ると 社内限り（${preview.data.internal.join(' / ')}）と `
              + `社外共有可（${preview.data.external.join(' / ')}）の2つができます。`
              + 'ONAiR からは消せないので、要るときだけ作ってください。'
            : 'ONAiR からは消せないので、要るときだけ作ってください。'
        }
        action={canEdit
          ? <Button onClick={onCreate} disabled={create.isPending}>
              <FolderPlus className="mr-2 h-4 w-4" aria-hidden="true" />BOX フォルダを作る
            </Button>
          : undefined}
      />
    );
  }

  return (
    <div className="space-y-2.5">
      <FolderCard
        url={project.box_url_internal}
        icon={<Lock className="h-4 w-4 text-warning" aria-hidden="true" />}
        title="社内限り"
        sub="仕入値・発注書。発注者にも PM 会社にも見せません"
      />
      <FolderCard
        url={project.box_url_external}
        icon={<Users className="h-4 w-4 text-primary" aria-hidden="true" />}
        title="社外共有可"
        sub="個別見積・議事メモ・図面・仕様書・工程表。相手と一緒に進めるもの"
      />
      <p className="text-note text-muted-foreground">
        中のファイルの一覧はここには出しません（BOX を開いて見てください）。
        <strong className="font-bold">ONAiR からファイルを置くことはまだできません。</strong>
      </p>
    </div>
  );
}

function FolderCard({
  url, icon, title, sub,
}: {
  url: string | null;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <section className="rounded-card flex flex-wrap items-center gap-3 border border-border bg-card p-3 lg:px-4">
      <span className="rounded-control flex h-9 w-9 shrink-0 items-center justify-center bg-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="text-cardtitle block">{title}</span>
        <span className="text-sub-sm block text-muted-foreground">{sub}</span>
      </span>
      {url ? (
        <Button variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />BOX で開く
          </a>
        </Button>
      ) : (
        // 片方だけ作れたときは、作れなかったほうをそう書く（黙って消すと気づけない）
        <span className="text-sub-sm text-muted-foreground">作れていません</span>
      )}
    </section>
  );
}
