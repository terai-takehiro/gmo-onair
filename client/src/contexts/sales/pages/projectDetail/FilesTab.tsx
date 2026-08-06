/**
 * 案件詳細 / 書類タブ (v4 ⑥)
 *
 * ── いまできること・できないこと ────────────────────────────
 *
 * BOX には**フォルダを作る口はありますが、中のファイルを一覧する口がありません**
 * (`POST /projects/:id/create-box-folder` だけ)。
 * ファイル名・更新日・アップロードをこの画面に出すには、
 * サーバー側に BOX の読み取りを足す必要があり、**それだけで1回ぶんの作業**です。
 *
 * → いまは **社内限り／社外共有の2つのフォルダを開く導線**と、
 *   **まだできないこと**をはっきり書きます。
 *   「フォルダを開くだけの画面」に見せて中身が無いと思わせないためです。
 *
 * ── なぜ社内と社外を分けて出すか ────────────────────────────
 *
 * モックの言葉:「社内と社外を混ぜない。見積・台本・納品物は社外。
 * 発注・請求・原価は社内。この画面でも**赤（社内）と緑（社外）で分けて出します**」。
 * 取り違えると原価が外に出るので、色と言葉の両方で分けます。
 */
import { FolderLock, FolderOpen, ExternalLink, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { ProjectDetail } from './types';

function FolderCard({
  tone, icon: Icon, title, what, url,
}: {
  tone: 'internal' | 'external';
  icon: typeof FolderLock;
  title: string;
  what: string;
  url: string | null;
}) {
  const inside = tone === 'internal';
  return (
    <section
      className={`rounded-card border p-4 ${
        inside ? 'border-destructive-border bg-destructive-surface' : 'border-success-border bg-success-surface'
      }`}
    >
      <h2 className={`text-cardtitle flex items-center gap-2 ${inside ? 'text-destructive' : 'text-success'}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />{title}
      </h2>
      <p className="text-note mt-1 text-secondary-foreground">{what}</p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sub min-h-tap mt-2 inline-flex items-center gap-1.5 font-bold text-primary hover:underline lg:min-h-[36px]"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />BOX で開く
        </a>
      ) : (
        <p className="text-sub mt-2 text-muted-foreground">まだ作られていません。</p>
      )}
    </section>
  );
}

export function FilesTab({ project }: { project: ProjectDetail }) {
  const qc = useQueryClient();
  const hasFolders = !!(project.box_url_internal || project.box_url_external);

  const createFolders = useMutation({
    mutationFn: () => api.post(`/projects/${project.id}/create-box-folder`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project.id] });
      notifySuccess('BOX にフォルダを作りました');
    },
    onError: (err) => notifyApiError('BOX のフォルダを作れませんでした', err),
  });

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:p-6">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <FolderCard
          tone="internal"
          icon={FolderLock}
          title="社内限り"
          what="発注・請求・原価。お客様には見せません。"
          url={project.box_url_internal}
        />
        <FolderCard
          tone="external"
          icon={FolderOpen}
          title="社外と共有"
          what="見積・台本・納品物。お客様と共有します。"
          url={project.box_url_external}
        />
      </div>

      {!hasFolders && (
        <div className="rounded-card border border-border bg-card p-4">
          <p className="text-sub text-secondary-foreground">
            この案件の BOX フォルダはまだありません。GLS を発番すると自動で作られます。
            先に作ることもできます。
          </p>
          <Button className="mt-2.5" disabled={createFolders.isPending} onClick={() => createFolders.mutate()}>
            BOX にフォルダを作る
          </Button>
        </div>
      )}

      <div className="flex items-start gap-2.5 rounded-note border border-primary-border bg-primary-surface-weak px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-note text-secondary-foreground">
          <strong className="font-bold">中のファイルをこの画面に並べるのは、次のバージョンで対応予定です。</strong>
          いまは BOX を開いて見てください。ここに落としてそのまま入れられるようにするのも同じ回でやります。
        </p>
      </div>
    </div>
  );
}
