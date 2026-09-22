/**
 * 「データベースを追加」（設計 §4-4・§6-⑩）
 *
 * ツリーの「＋」からは「ページ」と「データベース」の2つを選べるようにします。
 * ページ側は `components/page/PageCreateSheet.tsx`（段B）、データベース側がこれです。
 * **ツリー側の配線は段C の検査でまとめます** — ツリーの部品は段B の担当が
 * 触っているので、ここでは API とシートだけを用意します。
 *
 * ⚠️ **口が2つ要ります。** `POST /wiki/pages` は種類を受け取らないので、
 *    ページを作ってから `PATCH /wiki/pages/:id` の `kind` でデータベースにします
 *    （`lib/wikiDatabaseApi.ts` の `createWikiDatabase`）。
 *    前半だけ通って後半が失敗したときは、**出来たページへ案内します** —
 *    「追加できませんでした」とだけ言うと、ツリーに覚えの無いページが1枚残ります。
 *
 * ⚠️ 作ったあとに行くのは**そのデータベースのページ**（`/p/:id`）です。
 *    ページの追加は編集の画面へ行きますが、データベースで先にやることは
 *    本文を書くことではなく**項目を決めること**なので、右の「項目」がある画面へ出します。
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { Input } from '@gmo-onair/shared/src/client/ui/input';
import { Label } from '@gmo-onair/shared/src/client/ui/label';
import { notifyApiError, notifySuccess, notifyWarning } from '@gmo-onair/shared/src/client/notify';
import type { WikiPage, WikiTreeNode } from '@gmo-onair/shared/src/wiki/types';
import { useWikiSpaces, useWikiTree } from '@/lib/wikiApi';
import { buildWikiTree, flattenWikiTree } from '@/lib/wikiTree';
import { createWikiDatabase, WikiDatabaseKindError } from '@/lib/wikiDatabaseApi';
import { useWikiRefresh } from '@/components/page/pageOpsApi';

export interface DatabaseCreateSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 開いたときに選んでおくスペース（いま見ているスペース） */
  defaultSpaceKey?: string | null;
  /** 開いたときに選んでおく置き場所（行の「＋」から開いたとき） */
  defaultParentId?: string | null;
}

const SELECT_CLASS =
  'min-h-tap w-full rounded-control-lg border border-border bg-card px-3 text-list text-foreground lg:h-10 lg:min-h-0';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-th text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function DatabaseCreateSheet({
  open,
  onOpenChange,
  defaultSpaceKey,
  defaultParentId,
}: DatabaseCreateSheetProps) {
  const navigate = useNavigate();
  const refresh = useWikiRefresh();
  const spacesQ = useWikiSpaces({ enabled: open });

  const [spaceKey, setSpaceKey] = useState<string>(defaultSpaceKey ?? '');
  const [parentId, setParentId] = useState<string>(defaultParentId ?? '');
  const [title, setTitle] = useState('');

  // 開き直すたびに、押した場所に合わせて選び直す（前回の選択を引きずらない）
  useEffect(() => {
    if (!open) return;
    setSpaceKey(defaultSpaceKey ?? '');
    setParentId(defaultParentId ?? '');
    setTitle('');
  }, [open, defaultSpaceKey, defaultParentId]);

  const spaces = spacesQ.data ?? [];
  const effectiveKey = spaceKey || spaces[0]?.key || '';
  const space = spaces.find((s) => s.key === effectiveKey);
  const treeQ = useWikiTree(open && effectiveKey ? effectiveKey : undefined);

  const parentRows = useMemo(() => {
    const nodes: WikiTreeNode[] = treeQ.data ?? [];
    const roots = buildWikiTree(nodes);
    return flattenWikiTree(roots, new Set(nodes.map((n) => n.id)));
  }, [treeQ.data]);

  /** 出来たページへ送る（成功でも、種類だけ変えられなかったときでも同じ道） */
  const goToPage = (page: WikiPage) => {
    refresh.tree(space?.key);
    refresh.home();
    onOpenChange(false);
    navigate(`/p/${page.id}`);
  };

  const create = useMutation({
    meta: { action: 'データベースを追加' },
    mutationFn: async () => {
      if (!space) throw new Error('スペースを選んでください。');
      return createWikiDatabase({
        space_id: space.id,
        parent_id: parentId || null,
        title: title.trim() || undefined,
      });
    },
    onSuccess: (page) => {
      notifySuccess('データベースを追加しました', {
        description: `${page.title}（下書き）・次は右の「項目」で列を決めます`,
      });
      goToPage(page);
    },
    /*
     * ⚠️ `onError` を持つと共通の受け皿は黙ります（`shared/src/client/queryClient.ts`）。
     *    だから**ここで必ず知らせます**。途中まで出来たときだけ言い方を変えます。
     */
    onError: (err) => {
      if (err instanceof WikiDatabaseKindError) {
        notifyWarning(err.message);
        goToPage(err.page);
        return;
      }
      notifyApiError('データベースを追加できませんでした', err, 'もう一度お試しください。');
    },
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="データベースを追加"
      sub="1行が1ページになる一覧です。項目（列）はあとから決められます"
      size="md"
      onSubmit={(e) => {
        e.preventDefault();
        if (!create.isPending) create.mutate();
      }}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button type="submit" disabled={create.isPending || !space}>
            {create.isPending ? '追加中…' : '追加する'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="スペース">
          <select
            className={SELECT_CLASS}
            value={effectiveKey}
            onChange={(e) => {
              setSpaceKey(e.target.value);
              // スペースが変われば置き場所も選び直し（別のスペースの id は使えない）
              setParentId('');
            }}
          >
            {spaces.length === 0 && <option value="">読み込んでいます…</option>}
            {spaces.map((s) => (
              <option key={s.id} value={s.key}>{s.name}</option>
            ))}
          </select>
        </Field>

        <Field label="置き場所">
          <select
            className={SELECT_CLASS}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">{space ? `${space.name} の直下` : 'スペースの直下'}</option>
            {parentRows.map((n) => (
              <option key={n.id} value={n.id}>
                {`${'　'.repeat(n.depth)}${n.title}`}
              </option>
            ))}
          </select>
        </Field>

        <Field label="題（あとから直せます）">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: トラブル事例"
            maxLength={200}
          />
        </Field>
      </div>
    </Sheet>
  );
}
