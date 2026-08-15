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
 * ── ファイルを置ける ────────────────────────────────────────
 *
 * モックの「ここに落としたファイルは、選んだフォルダにそのまま入ります」を
 * 入れました。**社内と社外は別のカードで、置き場所を選ばせません** —
 * 1つの枠にまとめて「どちらに入れますか」と訊く形にすると、
 * 急いでいるときに取り違えて**原価が外に出ます**。
 *
 * **同じ名前のファイルは新しい版として上がります**（BOX の版履歴に残る）。
 * 上げられなかったものは名前を出します — 「3つ中2つ入った」を黙ると、
 * 同じものをもう一度上げることになります。
 *
 * ── なぜ社内と社外を分けて出すか ────────────────────────────
 *
 * モックの言葉:「社内と社外を混ぜない。見積・台本・納品物は社外。
 * 発注・請求・原価は社内。この画面でも**赤（社内）と緑（社外）で分けて出します**」。
 * 取り違えると原価が外に出るので、色と言葉の両方で分けます。
 */
import { useRef, useState } from 'react';
import { FolderLock, FolderOpen, ExternalLink, Info, File, Folder, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import { useAuth } from '@/contexts/platform/AuthContext';
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

/**
 * フォルダ1枚（中身の一覧 ＋ ここに落とすと入る枠）。
 *
 * **プロジェクト管理（GPM）もこの部品を使います。** 違うのは口の前置き（`base`）だけで、
 * 決めごと（社内と社外を混ぜない・置けない理由を1行で出す・5つまで・
 * 上げられなかったものは名前を出す）は同じものを読ませます —
 * 写すと、どちらかだけ直した日に**片方が原価を外に出す**形が生まれます。
 */
export function FolderCard({
  projectId, tone, icon: Icon, title, what, url, canEdit, base = '/projects',
}: {
  projectId: string;
  tone: 'internal' | 'external';
  icon: typeof FolderLock;
  title: string;
  what: string;
  url: string | null;
  canEdit: boolean;
  /** 口の前置き。案件は `/projects`、プロジェクトは `/gpm/projects` */
  base?: string;
}) {
  const inside = tone === 'internal';
  const scope = inside ? 'internal' : 'external';
  const qc = useQueryClient();
  const pick = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery<{
    data: BoxItem[]; reason?: string; total?: number; truncated?: boolean;
  }>({
    // **`base` も鍵に入れる。** 入れないと、案件とプロジェクトで同じ id を持つことは
    // 無いとはいえ、口が違うのに同じ鍵になる（片方の結果がもう片方に出うる）
    queryKey: ['box-files', base, projectId, scope],
    queryFn: async () => (await api.get(`${base}/${projectId}/box-files`, { params: { scope } })).data,
    // BOX の呼び出しは重いので、タブを行き来するたびには引き直さない
    staleTime: 60_000,
  });
  const items = data?.data ?? [];

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      // **5つまで。** それ以上は BOX を直接開いてもらう（1つずつ上げるので待たせすぎる）
      for (const f of files.slice(0, 5)) fd.append('files', f);
      return (await api.post(`${base}/${projectId}/box-files?scope=${scope}`, fd)).data.data as
        { uploaded: BoxItem[]; failed: string[] };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['box-files', base, projectId, scope] });
      notifySuccess(`${r.uploaded.length} 件を${title}に置きました`, {
        description: r.failed.length > 0
          ? `置けなかったもの: ${r.failed.join(' / ')}`
          : '同じ名前があったものは、新しい版として上がっています。',
      });
    },
    onError: (e) => notifyApiError('BOX に置けませんでした', e),
  });

  const send = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length > 0) upload.mutate(files);
  };
  /** フォルダが無い・BOX 未接続のときは置き場所が無い */
  const canPut = canEdit && !!url && data?.reason !== 'NOT_CONFIGURED';

  return (
    <section className="overflow-hidden rounded-card border border-border bg-card">
      <div className={`border-b p-4 ${
        inside ? 'border-destructive-border bg-destructive-surface' : 'border-success-border bg-success-surface'
      }`}>
        <h2 className={`text-cardtitle flex items-center gap-2 ${inside ? 'text-destructive' : 'text-success'}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />{title}
          {/* **数はフォルダにある総数**（並べた行の数ではない）。
              300 件あるのに「100」と出ると、上げた人は入っていないと読む */}
          {(data?.total ?? items.length) > 0 && (
            <span className="text-sub-sm font-number ml-auto text-secondary-foreground">
              {data?.total ?? items.length}
            </span>
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
      ) : isError ? (
        /*
         * ⚠️ **通信そのものが失敗したときを「空」と混ぜない**（レビューでの指摘 #51）。
         * サーバーは BOX の障害を `reason` に載せて 200 で返しますが、**サーバーに
         * 届かなかったとき**（通信断・500・権限）は `data` が無いだけなので、
         * 前の版は下の「まだ何も入っていません。」に落ちていました。
         * **入っているのに空と言われる**ので、上げた人は同じファイルをもう一度上げます。
         */
        <div className="p-4">
          <ErrorPanel title="中身を読み込めませんでした" error={error} onRetry={() => refetch()} />
        </div>
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

      {/* **切ったことを書く**（レビューでの指摘 #51）。BOX は1回に 100 件しか
          返さないので、前の版は 101 件目から**黙って出ていなかった** */}
      {data?.truncated && (
        <p className="text-note border-t border-border-subtle px-4 py-2.5 text-muted-foreground">
          多いのでここには{items.length} 件だけ出しています。残りは「BOX で開く」から見てください。
        </p>
      )}

      {canPut && (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}
          className={`m-3 flex flex-col items-center gap-2 rounded-note border border-dashed p-4 text-center ${
            over ? 'border-primary bg-primary-surface-weak' : 'border-border bg-surface-subtle'
          }`}
        >
          <input
            ref={pick}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { send(e.target.files); e.target.value = ''; }}
          />
          <p className="text-note text-muted-foreground">
            ここに落とすと<strong className="font-bold">{title}</strong>に入ります（5つまで）。
          </p>
          <Button variant="outline" disabled={upload.isPending} onClick={() => pick.current?.click()}>
            {upload.isPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            ファイルを選ぶ
          </Button>
        </div>
      )}
    </section>
  );
}

export function FilesTab({ project }: { project: ProjectDetail }) {
  const qc = useQueryClient();
  const { currentUser, permissions } = useAuth();
  const canEdit = currentUser?.role === 'system_admin'
    || ['editor', 'manager', 'owner'].includes(permissions?.sales ?? '');
  const hasFolders = !!(project.box_url_internal || project.box_url_external);

  const createFolders = useMutation({
    mutationFn: () => api.post(`/projects/${project.id}/create-box-folder`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project.id] });
      /*
       * ⚠️ **中身の鍵も落とす**（レビューでの指摘 #51）。作る前に読んだ結果
       * （`reason: 'NO_FOLDER'` ＝「フォルダがまだ作られていません。」）は
       * `staleTime: 60_000` で1分間そのまま残るので、**作った直後に
       * 「まだありません」と出たまま**でした。作った人には成功の帯と
       * 矛盾した画面が同時に見えます（そして押し直します）。
       */
      qc.invalidateQueries({ queryKey: ['box-files'] });
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
          canEdit={canEdit}
        />
        <FolderCard
          projectId={project.id}
          tone="external"
          icon={FolderOpen}
          title="社外と共有"
          what="見積・台本・納品物。お客様と共有します。"
          url={project.box_url_external}
          canEdit={canEdit}
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
          {/* ⚠️ **古い但し書きを残さない。** ここには「ファイルを落として入れられる
              ようにするのは、次の版の予定です」という趣旨の1文が残っていましたが、
              **その口はもう上の枠にあります**（`canPut` の枠）。読んだ人は
              使える機能を使わずに BOX を開きに行きます */}
          <strong className="font-bold">同じ名前のファイルを置くと、新しい版として上がります</strong>（前の版は BOX に残ります）。
        </p>
      </div>
    </div>
  );
}
