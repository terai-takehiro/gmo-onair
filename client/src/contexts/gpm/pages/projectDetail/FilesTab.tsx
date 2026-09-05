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
 * ── 中のファイルを出し、置けるようにした ────────────────────
 *
 * **案件詳細の書類タブと同じ部品**（`sales/.../FilesTab` の `FolderCard`）を呼びます。
 * 口の前置き（`/gpm/projects`）だけが違い、決めごと（1階層だけ・**再帰しない**／
 * BOX が落ちても 200 で理由を出す／社内と社外を混ぜない／5つまで／
 * 上げられなかったものは名前を出す）は同じものを読ませます。
 * 写すと、どちらかだけ直した日に**片方が原価を外に出す**形が生まれます。
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { FolderLock, FolderOpen, FolderPlus } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { FolderCard } from '@/contexts/sales/pages/projectDetail/FilesTab';
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
        '**本番の BOX に実際にフォルダができます。ONAiR からは削除できません**（削除するときは BOX で手で行います）。',
        p ? `社内限り: ${p.internal.join(' / ')}` : '',
        p ? `社外共有可: ${p.external.join(' / ')}` : '',
        '社内限りには仕入値と発注書を置きます（発注者にも PM 会社にも見せません）。',
      ].filter(Boolean).join('\n'),
      confirmLabel: 'フォルダを作る',
    });
    if (ok) create.mutate();
  };

  if (!has) {
    // **枠の余白はこのタブが持つ。** 詳細画面はタブごとの中身を素で置くので、
    // ここで持たないと BOX のカードだけ画面の端に貼り付く（他のタブと段が合わない）
    return (
      <div className="p-4 lg:px-6 lg:pb-6 lg:pt-5">
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
            ? (
              <Button onClick={onCreate} disabled={create.isPending}>
                <FolderPlus className="mr-2 h-4 w-4" aria-hidden="true" />BOX フォルダを作る
              </Button>
            )
            : undefined}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <FolderCard
        base="/gpm/projects"
        projectId={project.id}
        tone="internal"
        icon={FolderLock}
        title="社内限り"
        what="仕入値・発注書・原価。発注者にも PM 会社にも見せません"
        url={project.box_url_internal}
        canEdit={canEdit}
      />
      <FolderCard
        base="/gpm/projects"
        projectId={project.id}
        tone="external"
        icon={FolderOpen}
        title="社外共有可"
        what="個別見積・議事メモ・図面・仕様書・工程表。相手と一緒に進めるもの"
        url={project.box_url_external}
        canEdit={canEdit}
      />
      <p className="text-note text-muted-foreground">
        深いフォルダの中は出しません（1階層だけ）。その先は<strong className="font-bold">BOX で開いて</strong>見てください。
        同じ名前のファイルは<strong className="font-bold">新しい版</strong>として上がります（BOX の版履歴に残ります）。
      </p>
    </div>
  );
}
