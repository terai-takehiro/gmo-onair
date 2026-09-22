/**
 * ページの「…」（設計 §6-② の右上）
 *
 * 設計書が並べている項目は
 * 「お気に入り・複製・テンプレートにする・.md で書き出す・一覧から隠す」で、
 * これに manager だけの「削除」を足しています。
 *
 * 権限（§8）: 複製・書き出し・一覧から隠すは editor、
 * テンプレートの登録と削除は manager。持っていない人にはその項目を**出しません**
 * （押してから断られるより、何ができるかが見て分かります）。
 * **お気に入りだけは読める人全員**に出します（人ごとの印で、他の人の画面は変わりません）。
 *
 * ⚠️ **押した結果は帯（`notify`）で伝えます。** お気に入りはページの見た目が
 *    変わらない操作なので、何も出さないと「押せたのかどうか」が分かりません。
 */
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Copy, Download, EyeOff, FileStack, Star, StarOff, Trash2, Undo2 } from 'lucide-react';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { WikiPage } from '@gmo-onair/shared/src/wiki/types';
import { usePermissions } from '@/hooks/usePermissions';
import { downloadPageAsMarkdown } from '@/lib/wikiExportApi';
import WikiMoreMenu, { type WikiMenuItem } from './WikiMoreMenu';
import {
  createWikiPage,
  deleteWikiPage,
  patchWikiPageInfo,
  patchWikiPageStatus,
  setWikiFavorite,
  setWikiTemplate,
  useWikiRefresh,
} from './pageOpsApi';

export default function PageActionsMenu({ page }: { page: WikiPage }) {
  const navigate = useNavigate();
  const refresh = useWikiRefresh();
  const { canEdit, canManage } = usePermissions();

  /**
   * お気に入りに入れる／外す（§6-①②）。
   *
   * ホームの「お気に入り」（`GET /wiki/home`）とこのページの `favorited` が
   * 同じ印を読むので、**両方を読み直します**（片方だけだと、ホームに戻ったときに
   * 入れたはずのページが並んでいません）。
   */
  const favorite = useMutation({
    mutationFn: () => setWikiFavorite(page.id, !page.favorited),
    onSuccess: (result) => {
      refresh.page(page.id);
      refresh.home();
      notifySuccess(result.favorited ? 'お気に入りに入れました' : 'お気に入りから外しました', {
        description: result.favorited ? 'Wiki のホームの「お気に入り」に出ます。' : undefined,
      });
    },
    onError: (err) => notifyApiError('お気に入りを変えられませんでした', err),
  });

  /**
   * `.md` で書き出す（§5-2 の約束3-1）。
   *
   * ⚠️ **組み立てはサーバー（`GET /wiki/pages/:id.md`）に任せます。** 段B の間は
   * この画面で YAML の見出しを組んでいましたが、同じ書式が2か所にあると
   * 片方だけが古くなります（MCP・zip と1文字も違わない `.md` が要るため）。
   */
  const exportMd = useMutation({
    mutationFn: () => downloadPageAsMarkdown(page),
    onError: (err) => notifyApiError('ページを書き出せませんでした', err),
  });

  /**
   * 複製。**タグは作ったあとに付け直します** — `POST /wiki/pages` がタグを写すのは
   * テンプレートから作ったときだけで、本文を渡して作ったページには付きません
   * （`wiki-write.service.ts` の `createPage`）。
   */
  const duplicate = useMutation({
    meta: { action: 'ページを複製' },
    mutationFn: async () => {
      const copy = await createWikiPage({
        space_id: page.space_id,
        parent_id: page.parent_id,
        title: `${page.title} のコピー`,
        body_md: page.body_md,
        icon: page.icon,
      });
      if (page.tags.length > 0) {
        try {
          await patchWikiPageInfo(copy.id, { tags: page.tags });
        } catch (err) {
          // 本体は作れているので、タグだけの失敗で複製ごと無かったことにしない
          notifyApiError('複製したページにタグを追加できませんでした', err);
        }
      }
      return copy;
    },
    onSuccess: (copy) => {
      refresh.tree(page.space_key);
      refresh.home();
      notifySuccess('ページを複製しました', { description: `${copy.title}（下書き）` });
      navigate(`/p/${copy.id}`);
    },
  });

  const toggleTemplate = useMutation({
    meta: { action: 'テンプレートの登録を変更' },
    mutationFn: () => setWikiTemplate(page.id, !page.is_template),
    onSuccess: () => {
      refresh.page(page.id);
      refresh.templates();
      notifySuccess(page.is_template ? 'テンプレートから外しました' : 'テンプレートにしました', {
        description: page.is_template
          ? 'ページの内容はそのまま残ります。'
          : 'ページを追加するときの選択肢に出るようになります。',
      });
    },
  });

  /**
   * 一覧から隠す／戻す（設計 §4-1 の `archived`）。
   * **消えるわけではありません** — ツリーと検索に出なくなるだけで、リンクをたどれば読めます。
   */
  const archive = useMutation({
    meta: { action: 'ページの表示を変更' },
    mutationFn: () =>
      patchWikiPageStatus(page.id, page.status === 'archived' ? 'published' : 'archived'),
    onSuccess: (next) => {
      refresh.tree(page.space_key);
      refresh.page(page.id);
      refresh.home();
      notifySuccess(
        next.status === 'archived' ? 'ページを一覧から隠しました' : 'ページを一覧に戻しました',
        {
          description:
            next.status === 'archived'
              ? 'ツリーと検索には出なくなります。リンクをたどれば読めます。'
              : undefined,
        },
      );
    },
  });

  const remove = useMutation({
    meta: { action: 'ページを削除' },
    mutationFn: () => deleteWikiPage(page.id),
    onSuccess: (result) => {
      refresh.tree(page.space_key);
      refresh.home();
      const extra = result.deleted_ids.length - 1;
      notifySuccess('ページを削除しました', {
        description: extra > 0 ? `下にあった ${extra} 件も一緒に削除しました。` : undefined,
      });
      navigate(page.space_key ? `/s/${page.space_key}` : '/');
    },
  });

  const askAndRemove = async () => {
    const ok = await confirmAction({
      title: `「${page.title}」を削除しますか？`,
      description: 'このページの下にあるページも一緒に削除されます。あとから戻せません。',
      confirmLabel: '削除する',
      tone: 'danger',
    });
    if (ok) remove.mutate();
  };

  const items: WikiMenuItem[] = [
    {
      key: 'favorite',
      label: page.favorited ? 'お気に入りから外す' : 'お気に入りに入れる',
      icon: page.favorited ? StarOff : Star,
      separatorAfter: true,
      disabled: favorite.isPending,
      onSelect: () => favorite.mutate(),
    },
  ];

  if (canEdit) {
    items.push({
      key: 'duplicate',
      label: '複製する',
      icon: Copy,
      disabled: duplicate.isPending,
      onSelect: () => duplicate.mutate(),
    });
  }
  if (canManage) {
    items.push({
      key: 'template',
      label: page.is_template ? 'テンプレートをやめる' : 'テンプレートにする',
      icon: FileStack,
      disabled: toggleTemplate.isPending,
      onSelect: () => toggleTemplate.mutate(),
    });
  }
  if (canEdit) {
    items.push({
      key: 'export',
      label: '.md で書き出す',
      icon: Download,
      separatorAfter: true,
      disabled: exportMd.isPending,
      onSelect: () => exportMd.mutate(),
    });
    items.push({
      key: 'archive',
      label: page.status === 'archived' ? '一覧に戻す' : '一覧から隠す',
      icon: page.status === 'archived' ? Undo2 : EyeOff,
      disabled: archive.isPending,
      onSelect: () => archive.mutate(),
    });
  }
  if (canManage) {
    items.push({
      key: 'delete',
      label: '削除する',
      icon: Trash2,
      danger: true,
      disabled: remove.isPending,
      onSelect: () => void askAndRemove(),
    });
  }

  return <WikiMoreMenu label={page.title} items={items} />;
}
