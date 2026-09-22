/**
 * 「ページを追加」（§6-①③）
 *
 * スペースと親ページとテンプレートを選んで1枚作ります。作ったらそのまま
 * 編集の画面へ移ります — 作ったあとに空のページを読む画面に着くと、
 * 「作れたのかどうか」が分からないためです。
 *
 * ⚠️ 題は**入れなくてよい**（サーバーが「無題のページ」にします）。
 * ここで題を必須にすると、思いついたことを書き始める前に名前を考えさせることになります。
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { Input } from '@gmo-onair/shared/src/client/ui/input';
import { Label } from '@gmo-onair/shared/src/client/ui/label';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { WikiTreeNode } from '@gmo-onair/shared/src/wiki/types';
import { useWikiSpaces, useWikiTree } from '@/lib/wikiApi';
import { buildWikiTree, flattenWikiTree } from '@/lib/wikiTree';
import { createWikiPage, useWikiRefresh, useWikiTemplates } from './pageOpsApi';

export interface PageCreateSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 開いたときに選んでおくスペース（いま見ているスペース） */
  defaultSpaceKey?: string | null;
  /** 開いたときに選んでおく親ページ（行の `+` から開いたとき） */
  defaultParentId?: string | null;
}

/** 選択欄1つ分。`<select>` を素で使う（この製品の `Select` は Radix で、狭い列で重い） */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-th text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

const SELECT_CLASS =
  'min-h-tap w-full rounded-control-lg border border-border bg-card px-3 text-list text-foreground lg:h-10 lg:min-h-0';

export default function PageCreateSheet({
  open,
  onOpenChange,
  defaultSpaceKey,
  defaultParentId,
}: PageCreateSheetProps) {
  const navigate = useNavigate();
  const refresh = useWikiRefresh();
  const spacesQ = useWikiSpaces({ enabled: open });
  const templatesQ = useWikiTemplates(open);

  const [spaceKey, setSpaceKey] = useState<string>(defaultSpaceKey ?? '');
  const [parentId, setParentId] = useState<string>(defaultParentId ?? '');
  const [templateId, setTemplateId] = useState<string>('');
  const [title, setTitle] = useState('');

  // 開き直すたびに、押した場所に合わせて選び直す（前回の選択を引きずらない）
  useEffect(() => {
    if (!open) return;
    setSpaceKey(defaultSpaceKey ?? '');
    setParentId(defaultParentId ?? '');
    setTemplateId('');
    setTitle('');
  }, [open, defaultSpaceKey, defaultParentId]);

  const spaces = spacesQ.data ?? [];
  // スペースを選んでいないときは、読めるスペースの先頭を使う
  const effectiveKey = spaceKey || spaces[0]?.key || '';
  const space = spaces.find((s) => s.key === effectiveKey);
  const treeQ = useWikiTree(open && effectiveKey ? effectiveKey : undefined);

  const parentRows = useMemo(() => {
    const nodes: WikiTreeNode[] = treeQ.data ?? [];
    const roots = buildWikiTree(nodes);
    // 親に選べるのは全部の行。開閉に関係なく並べるので「全部開いた」状態で平らにする
    return flattenWikiTree(roots, new Set(nodes.map((n) => n.id)));
  }, [treeQ.data]);

  const templates = (templatesQ.data ?? []).filter(
    (t) => !space || t.space_id === space.id,
  );

  const create = useMutation({
    meta: { action: 'ページを追加' },
    mutationFn: async () => {
      if (!space) throw new Error('スペースを選んでください。');
      return createWikiPage({
        space_id: space.id,
        parent_id: parentId || null,
        title: title.trim() || undefined,
        templateId: templateId || null,
      });
    },
    onSuccess: (page) => {
      refresh.tree(space?.key);
      refresh.home();
      onOpenChange(false);
      notifySuccess('ページを追加しました', { description: `${page.title}（下書き）` });
      navigate(`/p/${page.id}/edit`);
    },
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="ページを追加"
      sub="スペースと置き場所を選びます。題はあとから直せます"
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
              // スペースが変われば親もテンプレートも選び直し（別のスペースの id は使えない）
              setParentId('');
              setTemplateId('');
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

        <Field label="テンプレート">
          <select
            className={SELECT_CLASS}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">空のページ</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
          {templatesQ.isError && (
            <p className="text-sub-sm text-muted-foreground">
              テンプレートの一覧を読み込めませんでした。空のページから作れます。
            </p>
          )}
        </Field>

        <Field label="題（あとから直せます）">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="無題のページ"
            maxLength={200}
          />
        </Field>
      </div>
    </Sheet>
  );
}
