/**
 * テンプレート管理 `/wiki/templates`（§6-① の「管理」・**PC の画面**）
 *
 * テンプレートは「ページを追加」の選択肢に出るものです。ここでは
 * **一覧・中身の確認・テンプレートをやめる**の3つができます。
 *
 * ⚠️ **ここで「削除」と言うのはページそのものの削除ではありません。**
 * テンプレートをやめても、そのページと中身はスペースに残ります
 * （中身ごと消すのはページの「…」の削除です）。選択肢から外すことと
 * 中身を消すことは取り返しの付き方が違うので、同じ言葉にしません。
 *
 * ⚠️ 一覧は `GET /wiki/templates` で、**editor を持っていない人には返りません**。
 * 権限が無い人には案内を出して、問い合わせ自体を投げません。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { FileStack } from 'lucide-react';
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import {
  Delayed,
  EmptyState,
  ErrorPanel,
  NoPermissionPanel,
  SkeletonRows,
} from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { usePermissions } from '@/hooks/usePermissions';
import { useWikiPage } from '@/lib/wikiApi';
import { stampLabel } from '@/lib/wikiFormat';
import WikiMarkdown from '@/components/wiki/WikiMarkdown';
import WikiMoreMenu from '@/components/page/WikiMoreMenu';
import {
  setWikiTemplate,
  useWikiRefresh,
  useWikiTemplates,
  type WikiTemplateBrief,
} from '@/components/page/pageOpsApi';
import { cn } from '@/lib/utils';

export default function TemplatesPage() {
  const { canEdit, canManage } = usePermissions();
  const refresh = useWikiRefresh();
  const templatesQ = useWikiTemplates(canEdit);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const unregister = useMutation({
    meta: { action: 'テンプレートの登録を変更' },
    mutationFn: (id: string) => setWikiTemplate(id, false),
    onSuccess: (_data, id) => {
      refresh.templates();
      refresh.page(id);
      if (pickedId === id) setPickedId(null);
      notifySuccess('テンプレートから外しました', {
        description: 'ページと中身はスペースにそのまま残ります。',
      });
    },
  });

  const askAndUnregister = async (t: WikiTemplateBrief) => {
    const ok = await confirmAction({
      title: `「${t.title}」をテンプレートからやめますか？`,
      description: 'ページを追加するときの選択肢から外れます。ページと中身は残ります。',
      confirmLabel: 'テンプレートをやめる',
    });
    if (ok) unregister.mutate(t.id);
  };

  if (!canEdit) {
    return (
      <PageShell>
        <NoPermissionPanel modules={['wiki']} level="editor" target="テンプレートの一覧" />
      </PageShell>
    );
  }

  const templates = templatesQ.data ?? [];

  return (
    <PageShell>
      <PageHeader
        title="テンプレート"
        sub={
          templatesQ.isLoading
            ? undefined
            : `${templates.length}件 ・ ページを追加するときの選択肢に出ます`
        }
      />

      {templatesQ.isError ? (
        <ErrorPanel
          title="テンプレートの一覧を読み込めませんでした"
          error={templatesQ.error}
          onRetry={() => void templatesQ.refetch()}
        />
      ) : templatesQ.isLoading ? (
        <Delayed><SkeletonRows rows={6} rowHeight={56} /></Delayed>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<FileStack />}
          title="テンプレートはまだありません"
          description="ページを開いて「…」から「テンプレートにする」を選ぶと、ここに並びます。"
        />
      ) : (
        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="min-w-0 flex-1 overflow-hidden rounded-card border border-border">
            {/*
              ⚠️ **行ごと1つのボタンにしないこと。** 行の中に「ページを開く」と
              「やめる」があるので、押せるものを押せるもので包むことになります
              （HTML として不正で、読み上げも入れ子のボタンを読めません）。
              中身を選ぶのは題のボタン、操作は右端、と分けてあります。
            */}
            {templates.map((t) => (
              <Row key={t.id} divider interactive className={cn(pickedId === t.id && 'bg-primary-surface-weak')}>
                <RowMain>
                  <button
                    type="button"
                    onClick={() => setPickedId((prev) => (prev === t.id ? null : t.id))}
                    aria-pressed={pickedId === t.id}
                    className="block w-full text-left"
                  >
                    <RowTitle>{t.title}</RowTitle>
                    <RowSub>
                      {t.space_name}
                      {t.tags.length > 0 && ` ・ ${t.tags.join(' / ')}`}
                      {` ・ 更新 ${stampLabel(t.updated_at)}`}
                    </RowSub>
                  </button>
                </RowMain>
                <RowSlot w={160} align="right" placeholder="">
                  <span className="flex items-center justify-end gap-1">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/p/${t.id}`}>ページを開く</Link>
                    </Button>
                    {/* 「…」は manager だけ。持っていない人には出ない（中身は空） */}
                    <WikiMoreMenu
                      label={t.title}
                      items={canManage
                        ? [{
                          key: 'unregister',
                          label: 'テンプレートをやめる',
                          icon: FileStack,
                          disabled: unregister.isPending,
                          onSelect: () => void askAndUnregister(t),
                        }]
                        : []}
                    />
                  </span>
                </RowSlot>
              </Row>
            ))}
          </div>

          <TemplatePreview id={pickedId} />
        </div>
      )}
    </PageShell>
  );
}

/** 選んだテンプレートの中身。選んでいない間は何をする場所かだけ出す */
function TemplatePreview({ id }: { id: string | null }) {
  const pageQ = useWikiPage(id ?? undefined);

  return (
    <aside className="min-w-0 rounded-card border border-border bg-card p-4 xl:w-[420px] xl:shrink-0">
      <h2 className="mb-2 text-cardtitle text-foreground">中身</h2>
      {!id ? (
        <p className="text-sub text-muted-foreground">
          左の行を選ぶと、そのテンプレートから作られる本文がここに出ます。
        </p>
      ) : pageQ.isError ? (
        <ErrorPanel
          title="テンプレートを読み込めませんでした"
          error={pageQ.error}
          onRetry={() => void pageQ.refetch()}
        />
      ) : !pageQ.data ? (
        <Delayed><SkeletonRows rows={5} rowHeight={20} /></Delayed>
      ) : !pageQ.data.body_md.trim() ? (
        <p className="text-sub text-muted-foreground">
          本文が空のテンプレートです。題だけを決めた1枚として使えます。
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <WikiMarkdown body={pageQ.data.body_md} />
        </div>
      )}
    </aside>
  );
}
