/**
 * ウィークリー活動報告 — 週次トピックス (人が書くところ) (v4)
 *
 * 確定 (公開) したあとは足せない。**AI が書いた本文には触れず**、
 * ここに人が足した行だけが人の言葉として残る。
 *
 * ── モックにあるが実装しないもの ────────────────────────────
 *
 * **「ニュース由来」のバッジは出していない。** モックにはあるが、
 * `ops_report_items` にどこから来た行かを記録する列が無い
 * (`source` は `ai` か `human` の2つだけで、デイリーニュースから来たかは分からない)。
 * 数えられないものを、それらしく出さない。
 *
 * ── 追加・編集フォームはボトムシートにした (v4ネイティブUI監査 2026-08-20) ──
 *
 * 以前は行の位置にインライン展開する自前フォームで、スマホでは一覧の途中に
 * フォームが割り込み、開いた行を探して閉じるまでスクロール位置を見失っていた。
 * `client-v4/formDialog.tsx` の `<FormDialog>` に載せ替え、スマホは下シート・
 * PC は中央ダイアログで開く（決めごと「終わらせるのはシートで」）。
 */
import { useEffect, useState } from 'react';
import { Check, Newspaper, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Row, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAddItem, useDeleteItem, useUpdateItem } from '@/lib/reportsApi';
import { WEEKLY_CATEGORIES, type OpsReportItem } from '@/lib/types';

const TEXTAREA = 'text-sub min-h-[140px] w-full rounded-control border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring';

export function TopicsSection({
  items, reportId, editable,
}: {
  items: OpsReportItem[];
  reportId: string;
  editable: boolean;
}) {
  const addItem = useAddItem();
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');

  const openAdd = () => {
    setCategory(''); setContent(''); setNote('');
    setAdding(true);
  };

  const submit = async () => {
    if (!content.trim()) return;
    try {
      await addItem.mutateAsync({ reportId, item: { category: category || null, content, note: note || null } });
      setAdding(false);
      notifySuccess('トピックを足しました');
    } catch (e) {
      notifyApiError('足せませんでした', e);
    }
  };

  return (
    <div className="rounded-card border border-border bg-card">
      {/*
        分類の候補。add/edit どちらのフォームからも参照するので1回だけ描く
        (以前は add フォームの中にだけあり、add を開かずに直接 edit すると
        候補が出なかった)
      */}
      <datalist id="weekly-categories">
        {WEEKLY_CATEGORIES.map((c) => <option key={c} value={c} />)}
      </datalist>

      {items.length === 0 && (
        <EmptyState
          className="border-0 bg-transparent"
          title="この週のトピックはまだありません"
          description={editable
            ? '自動集計に出ない出来事（お客様の反応・現場で気づいたこと）をここに書きます。'
            : 'この週は確定済みなので、これ以上は足せません。'}
        />
      )}

      {items.length > 0 && (
        <div className="flex flex-col">
          {items.map((item) => <TopicRow key={item.id} item={item} editable={editable} />)}
        </div>
      )}

      {editable && (
        <div className="border-t border-border-subtle p-2">
          <Button variant="ghost" className="min-h-tap w-full text-muted-foreground" onClick={openAdd}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> トピックを追加
          </Button>
        </div>
      )}

      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title="トピックを追加"
        sub="自動集計に出ない出来事（お客様の反応・現場で気づいたこと）を書きます"
        footer={(
          <FormDialogFooter>
            <Button variant="outline" className="min-h-tap" onClick={() => setAdding(false)}>キャンセル</Button>
            <Button className="min-h-tap" onClick={submit} disabled={!content.trim() || addItem.isPending}>追加</Button>
          </FormDialogFooter>
        )}
      >
        <div className="flex flex-col gap-3">
          {/*
            **書く欄（唯一の必須）を先頭に置く。** 以前は任意の分類・補足が上に
            あり、`autoFocus` を持つ「内容」がフォームの中段にあったので、
            開いた瞬間にカーソルだけが2段目に落ちて、上の欄を飛ばしたように見えた。
          */}
          <div>
            <label className="text-th text-muted-foreground" htmlFor="weekly-content">内容 *</label>
            <textarea
              id="weekly-content"
              className={TEXTAREA}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="この週のトピックを書く"
              autoFocus
            />
          </div>
          {/* 分類と補足は書いたあとに決めるもの（段6） */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-th text-muted-foreground" htmlFor="weekly-category">分類</label>
              <Input
                id="weekly-category"
                list="weekly-categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例: イベント"
              />
            </div>
            <div>
              <label className="text-th text-muted-foreground" htmlFor="weekly-note">補足 (任意)</label>
              <Input id="weekly-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="補足など" />
            </div>
          </div>
        </div>
      </FormDialog>
    </div>
  );
}

function TopicRow({ item, editable }: { item: OpsReportItem; editable: boolean }) {
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(item.category ?? '');
  const [content, setContent] = useState(item.content);
  const [note, setNote] = useState(item.note ?? '');

  const openEdit = () => {
    setCategory(item.category ?? ''); setContent(item.content); setNote(item.note ?? '');
    setEditing(true);
  };

  // 開いたまま裏で一覧が invalidate されて `item` の値が変わっても、
  // 古い値の全項目 PATCH で相手の更新を巻き戻さないよう再同期する（openEdit の再セットは開く時だけ）
  useEffect(() => {
    setCategory(item.category ?? '');
    setContent(item.content);
    setNote(item.note ?? '');
  }, [item.category, item.content, item.note]);

  const save = async () => {
    if (!content.trim()) return;
    try {
      await updateItem.mutateAsync({ itemId: item.id, fields: { category: category || null, content, note: note || null } });
      setEditing(false);
      notifySuccess('トピックを保存しました');
    } catch (e) {
      notifyApiError('保存できませんでした', e);
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: 'このトピックを削除しますか',
      description: item.content.slice(0, 60),
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (!ok) return;
    deleteItem.mutate(item.id, {
      onSuccess: () => notifySuccess('トピックを削除しました'),
      onError: (e) => notifyApiError('トピックを削除できませんでした', e),
    });
  };

  return (
    <>
      <Row divider align="start" stackOnMobile>
        {/*
          分類は「セールス・マーケティング」のように長い (WEEKLY_CATEGORIES)。
          `TableBadge` は折り返さないので列をはみ出す。ここは省略する文字で出す。
        */}
        <RowSlot w={128} hideOnMobile>
          <span className="text-sub-sm truncate text-muted-foreground" title={item.category ?? undefined}>
            {item.category || '—'}
          </span>
        </RowSlot>
        <RowMain>
          <p className="text-list whitespace-pre-wrap">
            {item.content}
            {/* **ニュース由来** (migration 167)。どこから来た行かが分かると、
                報告を読む人が「元の記事」を辿れる。手で書いた行には付かない */}
            {item.source_item_id && (
              <span className="text-badge ml-2 inline-flex shrink-0 items-center gap-0.5 rounded-badge-xs bg-primary-surface px-1.5 py-0.5 align-middle text-primary">
                <Newspaper className="h-3 w-3" aria-hidden="true" />ニュース由来
              </span>
            )}
          </p>
          {item.note && <p className="text-sub mt-0.5 whitespace-pre-wrap text-muted-foreground">{item.note}</p>}
        </RowMain>
        <RowSlot w={96} placeholder="">
          <span className="text-sub-sm inline-flex min-w-0 items-center gap-1 text-muted-foreground">
            {item.source === 'ai' && <Sparkles className="h-3 w-3 shrink-0 text-ai" aria-label="AI作成" />}
            <span className="truncate">{item.recorded_by ?? (item.source === 'ai' ? 'AI' : '—')}</span>
          </span>
        </RowSlot>
        {editable && (
          <RowSlot w={96} placeholder="">
            <span className="flex gap-0.5">
              <Button variant="ghost" size="icon" className="min-h-tap lg:min-h-[36px]" onClick={openEdit} aria-label="編集">
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" className="min-h-tap text-destructive lg:min-h-[36px]" onClick={remove} aria-label="削除">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </span>
          </RowSlot>
        )}
      </Row>

      {editable && (
        <FormDialog
          open={editing}
          onOpenChange={setEditing}
          title="トピックを編集"
          footer={(
            <FormDialogFooter>
              <Button variant="outline" className="min-h-tap" onClick={() => setEditing(false)}>キャンセル</Button>
              <Button className="min-h-tap" onClick={save} disabled={!content.trim() || updateItem.isPending}>
                <Check className="mr-1 h-4 w-4" aria-hidden="true" />保存
              </Button>
            </FormDialogFooter>
          )}
        >
          {/* **追加ダイアログと同じ並び・同じラベル。** 編集だけ `placeholder` に
              頼っていたので、打ち始めると何の欄か分からなくなっていた
              （id は行ごとに作る — 同じ週の行が同時に描かれるため） */}
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-th text-muted-foreground" htmlFor={`weekly-content-${item.id}`}>内容 *</label>
              <textarea
                id={`weekly-content-${item.id}`}
                className={TEXTAREA}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-th text-muted-foreground" htmlFor={`weekly-category-${item.id}`}>分類</label>
                <Input
                  id={`weekly-category-${item.id}`}
                  list="weekly-categories"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="例: イベント"
                />
              </div>
              <div>
                <label className="text-th text-muted-foreground" htmlFor={`weekly-note-${item.id}`}>補足 (任意)</label>
                <Input
                  id={`weekly-note-${item.id}`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="補足など"
                />
              </div>
            </div>
          </div>
        </FormDialog>
      )}
    </>
  );
}
