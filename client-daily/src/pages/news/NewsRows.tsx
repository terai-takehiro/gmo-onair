/**
 * デイリーニュース報告 — 1日ぶんの行 (v4)
 *
 * ── PC の表と スマホのカード に分けた（v4ネイティブUI監査 2026-08-20） ──
 *
 * 以前は `Row` + `RowSlot(hideOnMobile)` の1本で、スマホでは列を落として
 * `RowSub` に詰め込むだけの表縮小だった（専用のカード型レイアウトが無かった）。
 * `production/pages/holds/HoldCards.tsx` / `client-daily/pages/inview/DayCards.tsx`
 * と同じ考え方で、**列を消すのではなくカードとして組み直した**
 * （カードの実体は `./NewsCards.tsx`。出し分けは `DailyNewsPage.tsx` の `isMobile`）。
 *
 * ただし採用・週報へ送る・削除・編集の保存という**業務ロジックまで2通りに
 * 書くと、以前と同じ「表とカードで挙動が違う」不具合が再発する**
 * （この画面のコメント冒頭に書いてある実際の前科）。そこで `useNewsRowActions`
 * にまとめ、PC 行（`NewsRow`）とスマホカード（`./NewsCards.tsx`）の両方から呼ぶ。
 *
 * ── 列 (7段に寄せた・PC のみ) ───────────────────────────────
 *
 *   採用      56px   1〜5 の数字。**押すと変えられる**
 *   AI活用    56px   バッジ (52px の直書きだった。和文2字が入る最小は 56px)
 *   分類      96px   バッジ (90px の直書きだった)
 *   要約      伸びる ここだけが伸びる
 *   メモ      160px  (180px の直書きだった)
 *   記入者    96px   AI が入れたものはアイコンを付ける
 *   操作      128px  週報へ送る・編集・削除
 *
 * ── 「週報に送る」(モックのボタン・migration 167) ────────────
 *
 * 押すと**その日が属する週の週報へ写します**（移すのではなく写す —
 * ニュースはその日の記録として残り続けるため）。週は**ニュースの日付**で
 * 決まるので、金曜のぶんを月曜に送っても先週の週報に入ります。
 *
 * 送り済みの行は**押せない印**にします（消すと「送ったか分からない」に戻る）。
 * 週報側でその行を消せば、また送れるようになります。
 *
 * ── 編集はボトムシート（v4ネイティブUI監査 2026-08-20） ─────────
 *
 * 以前は `editing` のとき `Row` の代わりに `NewsForm` を返し、一覧のその場所に
 * インライン展開していた。`NewsForm` を `FormDialog`（下シート）へ載せ替えたので、
 * いまは **行はそのまま出し、フォームを兄弟要素として重ねる**
 * （`FormDialog` は Portal で描くのでどこに置いても画面には正しく重なる）。
 */
import { useState } from 'react';
import { Bot, CheckCheck, ExternalLink, Pencil, Send, Trash2 } from 'lucide-react';
import { Row, RowHeader, RowMain, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { Button } from '@/components/ui/button';
import { useDeleteItem, useSendToWeekly, useUpdateItem } from '@/lib/reportsApi';
import type { OpsReportItem } from '@/lib/types';
import { NewsForm, type NewsFields } from './NewsForm';

/**
 * 採用・週報へ送る・削除・編集の保存。**PC 行とスマホカードの共有ロジック**
 * （上のコメント参照）。写すとどちらかだけ直された日から挙動がずれる。
 */
export function useNewsRowActions(item: OpsReportItem) {
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const sendToWeekly = useSendToWeekly();
  const [editing, setEditing] = useState(false);

  const toWeekly = () => sendToWeekly.mutate(item.id, {
    onSuccess: (r) => notifySuccess(
      r.already
        ? 'この行はすでに週報へ送られています'
        : `${r.weekStart} の週の週報に写しました`,
    ),
    onError: (e) => notifyApiError('週報に送れませんでした', e),
  });

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

  return {
    editing, setEditing,
    toWeekly, sendPending: sendToWeekly.isPending,
    setPick,
    remove,
    saveEdit, updatePending: updateItem.isPending,
  };
}

export function NewsRowsHeader({ canEdit }: { canEdit: boolean }) {
  return (
    <RowHeader className="hidden sm:flex">
      <RowSlot w={56} align="center">採用</RowSlot>
      <RowSlot w={56} align="center">AI活用</RowSlot>
      <RowSlot w={96}>分類</RowSlot>
      <RowMain>要約</RowMain>
      <RowSlot w={160}>メモ</RowSlot>
      <RowSlot w={96}>記入者</RowSlot>
      {canEdit && <RowSlot w={128} />}
    </RowHeader>
  );
}

/**
 * PC 専用の1行。**スマホは `./NewsCards.tsx` の `NewsCard` に差し替え済み**
 * （v4ネイティブUI監査 2026-08-20）。出し分けは `DailyNewsPage.tsx` の `isMobile`。
 */
export function NewsRow({ item, canEdit, weeklyLocked = false }: {
  item: OpsReportItem;
  canEdit: boolean;
  /** 送り先の週報が確定済み。**押す前に止める**（サーバーも断る） */
  weeklyLocked?: boolean;
}) {
  const {
    editing, setEditing, toWeekly, sendPending, setPick, remove, saveEdit, updatePending,
  } = useNewsRowActions(item);

  return (
    <>
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
                /* 本文中の小さな印なので、見た目は 14px のまま当たり判定だけ 44px にする */
                className="v4-tap ml-1 inline-flex align-middle text-primary hover:underline"
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
          <RowSlot w={128} placeholder="">
            <span className="flex gap-0.5">
              <Button
                variant="ghost" size="icon"
                className={`min-h-tap lg:min-h-[36px] ${item.sent_to_weekly ? 'text-success' : ''}`}
                disabled={item.sent_to_weekly || weeklyLocked || sendPending}
                onClick={toWeekly}
                aria-label={item.sent_to_weekly ? '週報に送り済み' : '週報に送る'}
                title={item.sent_to_weekly
                  ? 'この行は週報へ送り済みです'
                  : weeklyLocked
                    ? 'この週の週報は確定済みです。週報の画面で「確定を解く」を押すと送れます'
                    : 'この日が入る週の週報へ写します'}
              >
                {item.sent_to_weekly
                  ? <CheckCheck className="h-4 w-4" aria-hidden="true" />
                  : <Send className="h-4 w-4" aria-hidden="true" />}
              </Button>
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

      {editing && (
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
          submitting={updatePending}
        />
      )}
    </>
  );
}
