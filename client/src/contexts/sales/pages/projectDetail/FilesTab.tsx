/**
 * 案件詳細 / 書類タブ (v4 ⑥)
 *
 * ── BOX の中身を出します ────────────────────────────────────
 *
 * `GET /projects/:id/box-files?scope=internal|external` で1階層ぶん引きます。
 * **再帰はしません** — 深いフォルダを全部たどると呼び出し回数が読めず画面が固まるので、
 * その先は BOX を開いて見てもらいます。
 *
 * ── BOX が落ちていても案件は止めない ────────────────────────
 *
 * このリポジトリの決めごとです。サーバーは**失敗しても 200 で返し**、
 * 理由 (`NO_FOLDER` / `NOT_CONFIGURED` / `UNAVAILABLE`) だけを渡します。
 * 画面はその理由を1行で出すだけで、**他のタブは普通に使えます**。
 * ここでエラー画面にすると、BOX が落ちた日に案件詳細が全部開けなくなります。
 *
 * ── ファイルを置くのはまだできません ────────────────────────
 *
 * モックは「ここに落としたファイルは、選んだフォルダにそのまま入ります」と
 * 書いていますが、**アップロードは入れていません** (読み取りとは別の作業)。
 * できないことは画面に書きます。
 *
 * ── なぜ社内と社外を分けて出すか ────────────────────────────
 *
 * モックの言葉:「社内と社外を混ぜない。見積・台本・納品物は社外。
 * 発注・請求・原価は社内。この画面でも**赤（社内）と緑（社外）で分けて出します**」。
 * 取り違えると原価が外に出るので、色と言葉の両方で分けます。
 */
import { FolderLock, FolderOpen, ExternalLink, Info, File, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import type { ProjectDetail } from './types';

interface BoxItem {
  id: string; type: 'file' | 'folder'; name: string;
  size: number | null; modified_at: string | null; modified_by: string | null; url: string;
}

/** 中身が出せない理由。**「空」と「つながらない」を混ぜない** */
const REASON: Record<string, string> = {
  NO_FOLDER: 'フォルダがまだ作られていません。',
  NOT_CONFIGURED: 'この環境は BOX につないでいないので、中身は出せません。',
  UNAVAILABLE: 'BOX につながりませんでした。あとでもう一度見てください（案件の作成や更新は続けられます）。',
};

/** ファイルの大きさ。**桁を読ませない** — 「212 KB」で足りる */
function size(n: number | null): string | null {
  if (n === null) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function FolderCard({
  projectId, tone, icon: Icon, title, what, url,
}: {
  projectId: string;
  tone: 'internal' | 'external';
  icon: typeof FolderLock;
  title: string;
  what: string;
  url: string | null;
}) {
  const inside = tone === 'internal';
  const scope = inside ? 'internal' : 'external';
  const { data, isLoading } = useQuery<{ data: BoxItem[]; reason?: string }>({
    queryKey: ['box-files', projectId, scope],
    queryFn: async () => (await api.get(`/projects/${projectId}/box-files`, { params: { scope } })).data,
    // BOX の呼び出しは重いので、タブを行き来するたびには引き直さない
    staleTime: 60_000,
  });
  const items = data?.data ?? [];

  return (
    <section className="overflow-hidden rounded-card border border-border bg-card">
      <div className={`border-b p-4 ${
        inside ? 'border-destructive-border bg-destructive-surface' : 'border-success-border bg-success-surface'
      }`}>
        <h2 className={`text-cardtitle flex items-center gap-2 ${inside ? 'text-destructive' : 'text-success'}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />{title}
          {items.length > 0 && (
            <span className="text-sub-sm font-number ml-auto text-secondary-foreground">{items.length}</span>
          )}
        </h2>
        <p className="text-note mt-1 text-secondary-foreground">{what}</p>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sub min-h-tap mt-2 inline-flex items-center gap-1.5 font-bold text-primary hover:underline lg:min-h-[36px]"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />BOX で開く
          </a>
        )}
      </div>

      {isLoading ? (
        <div className="p-3"><Delayed><SkeletonRows rows={3} /></Delayed></div>
      ) : data?.reason ? (
        <p className="text-sub px-4 py-4 text-muted-foreground">{REASON[data.reason] ?? data.reason}</p>
      ) : items.length === 0 ? (
        <p className="text-sub px-4 py-4 text-muted-foreground">まだ何も入っていません。</p>
      ) : (
        items.map((it) => (
          <Row key={it.id} divider interactive stackOnMobile>
            <RowSlot w={56}>
              {it.type === 'folder'
                ? <Folder className="h-4 w-4 text-primary" aria-hidden="true" />
                : <File className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            </RowSlot>
            <RowMain>
              <RowTitle>{it.name}</RowTitle>
              <RowSub>
                {[size(it.size), it.modified_by, formatRelativeTime(it.modified_at)]
                  .filter(Boolean).join(' ・ ')}
              </RowSub>
            </RowMain>
            <RowSlot w={72} align="right">
              <a href={it.url} target="_blank" rel="noopener noreferrer"
                 className="text-sub min-h-tap inline-flex items-center gap-1 text-primary hover:underline lg:min-h-[36px]">
                開く
              </a>
            </RowSlot>
          </Row>
        ))
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
          projectId={project.id}
          tone="internal"
          icon={FolderLock}
          title="社内限り"
          what="発注・請求・原価。お客様には見せません。"
          url={project.box_url_internal}
        />
        <FolderCard
          projectId={project.id}
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
          出しているのは<strong className="font-bold">1階層ぶん</strong>です。その先はフォルダを押して BOX で見てください。
          <strong className="font-bold">ここにファイルを落として入れられるようにするのは、次のバージョンで対応予定です。</strong>
        </p>
      </div>
    </div>
  );
}
