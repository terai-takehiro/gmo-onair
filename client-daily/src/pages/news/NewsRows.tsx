/**
 * デイリーニュース報告 — 1日ぶんの行 (v4)
 *
 * ── 表と カード を1つにした ─────────────────────────────────
 *
 * 以前は同じ内容を `<table>` (PC) と `<div>` (スマホ) の**2通りで書いて**いた。
 * 片方だけ直されて食い違うので (実際に採用の選び方が表とカードで違っていた)、
 * `Row` + `RowSlot` の1本にして、スマホでは列を落とす形にした。
 *
 * ── 列 (7段に寄せた) ────────────────────────────────────────
 *
 *   採用      56px   1〜5 の数字。**押すと変えられる**
 *   AI活用    56px   バッジ (52px の直書きだった。和文2字が入る最小は 56px)
 *   分類      96px   バッジ (90px の直書きだった)
 *   要約      伸びる ここだけが伸びる
 *   メモ      160px  (180px の直書きだった)
 *   記入者    96px   AI が入れたものはアイコンを付ける
 *   操作      96px   編集・削除
 */
import { useState } from 'react';
import { Bot, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { Row, RowHeader, RowMain, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { Button } from '@/components/ui/button';
import { useDeleteItem, useUpdateItem } from '@/lib/reportsApi';
import type { OpsReportItem } from '@/lib/types';
import { NewsForm, type NewsFields } from './NewsForm';

export function NewsRowsHeader({ canEdit }: { canEdit: boolean }) {
  return (
    <RowHeader className="hidden sm:flex">
      <RowSlot w={56} align="center">採用</RowSlot>
      <RowSlot w={56} align="center">AI活用</RowSlot>
      <RowSlot w={96}>分類</RowSlot>
      <RowMain>要約</RowMain>
      <RowSlot w={160}>メモ</RowSlot>
      <RowSlot w={96}>記入者</RowSlot>
      {canEdit && <RowSlot w={96} />}
    </RowHeader>
  );
}

export function NewsRow({ item, canEdit }: { item: OpsReportItem; canEdit: boolean }) {
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const [editing, setEditing] = useState(false);

  const setPick = (pick: number | null) =>
    updateItem.mutate({ itemId: item.id, fields: { pick } }, {
      onError: (e) => notifyApiError('採用を変えられませんでした', e),
    });

  const remove = async () => {
    const ok = await confirmAction({
      title: 'このニュースを消しますか',
      description: item.content.slice(0, 60),
      confirmLabel: '削除する',
      tone: 'danger',
    });
    if (!ok) return;
    deleteItem.mutate(item.id, {
      onSuccess: () => notifySuccess('ニュースを消しました'),
      onError: (e) => notifyApiError('消せませんでした', e),
    });
  };

  const saveEdit = async (fields: NewsFields) => {
    try {
      await updateItem.mutateAsync({ itemId: item.id, fields });
      setEditing(false);
      notifySuccess('ニュースを直しました');
    } catch (e) {
      notifyApiError('保存できませんでした', e);
    }
  };

  if (editing) {
    return (
      <NewsForm
        initial={{
          category: item.category,
          content: item.content,
          note: item.note,
          url: item.url,
          ai_related: !!item.ai_related,
        }}
        onCancel={() => setEditing(false)}
        onSubmit={saveEdit}
        submitting={updateItem.isPending}
      />
    );
  }

  return (
    <Row divider align="start" stackOnMobile>
      <RowSlot w={56} align="center" placeholder="">
        {canEdit ? (
          <select
            className="text-sub-sm min-h-tap w-full rounded-badge border border-border bg-background text-center lg:min-h-[32px]"
            value={item.pick ?? ''}
            onChange={(e) => setPick(e.target.value ? Number(e.target.value) : null)}
            aria-label="採用（1〜5）"
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : (
          <span className="font-number text-sub-sm">{item.pick ?? '—'}</span>
        )}
      </RowSlot>

      <RowSlot w={56} align="center" placeholder="">
        {item.ai_related ? <TableBadge label="AI" w={null} className="border-ai-border bg-ai-surface text-ai" /> : null}
      </RowSlot>

      {/*
        分類は `NEWS_CATEGORIES` の候補 (最長5字) を想定しているが、
        入力欄は `datalist` なので**長い文字も入れられる**。`TableBadge` は
        折り返さないので、列からはみ出して隣に重ならないよう切り落とす。
      */}
      <RowSlot w={96} placeholder="" className="overflow-hidden">
        {item.category ? <TableBadge label={item.category} w={null} className="bg-muted text-muted-foreground" /> : null}
      </RowSlot>

      <RowMain>
        <p className="text-list whitespace-pre-wrap">
          {item.content}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 inline-flex align-middle text-primary hover:underline"
              title={item.url}
              aria-label="元の記事を開く"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </p>
        {/* スマホでは右の列が畳まれるので、メモと記入者をここに出す */}
        <RowSub className="sm:hidden">
          {[item.note, item.recorded_by].filter(Boolean).join(' ・ ') || '—'}
        </RowSub>
      </RowMain>

      <RowSlot w={160} hideOnMobile>
        <span className="text-sub-sm truncate text-muted-foreground">{item.note ?? '—'}</span>
      </RowSlot>

      <RowSlot w={96} hideOnMobile>
        <span className="text-sub-sm inline-flex min-w-0 items-center gap-1 text-muted-foreground">
          {item.source === 'ai' && <Bot className="h-3 w-3 shrink-0 text-ai" aria-label="AI が入れました" />}
          <span className="truncate">{item.recorded_by ?? '—'}</span>
        </span>
      </RowSlot>

      {canEdit && (
        <RowSlot w={96} placeholder="">
          <span className="flex gap-0.5">
            <Button variant="ghost" size="icon" className="min-h-tap lg:min-h-[36px]" onClick={() => setEditing(true)} aria-label="編集">
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" className="min-h-tap text-destructive lg:min-h-[36px]" onClick={remove} aria-label="削除">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </span>
        </RowSlot>
      )}
    </Row>
  );
}
