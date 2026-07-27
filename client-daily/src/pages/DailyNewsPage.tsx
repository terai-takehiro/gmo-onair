import { useState } from 'react';
import {
  Newspaper, ChevronLeft, ChevronRight, Plus, Trash2, Pencil,
  Sparkles, CheckCircle2, ExternalLink, Bot,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useReportByPeriod, useEnsureReport, useAddItem, useUpdateItem, useDeleteItem, useReviewReport,
} from '@/lib/reportsApi';
import { usePermissions } from '@/hooks/usePermissions';
import { NEWS_CATEGORIES, formatDateJa, toDateStr, addDays, type OpsReportItem } from '@/lib/types';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { PageTitle } from '@gmo-onair/shared/src/client/ui';

export default function DailyNewsPage() {
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const { data: report, isLoading } = useReportByPeriod('daily_news', date);
  const { canEdit } = usePermissions();
  const ensure = useEnsureReport();
  const review = useReviewReport();
  const today = toDateStr(new Date());

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-4">
      {/* ヘッダー + 日付ナビ */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <PageTitle>
            <Newspaper className="h-5 w-5 text-primary" />
            デイリーニュース報告
          </PageTitle>
          <p className="mt-1 text-sm text-muted-foreground">AI が業界ニュースを日次収集。人の追記・採用ピックも可能です。</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => setDate(addDays(date, -1))} title="前日">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-[150px]" />
          <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} title="翌日">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ステータス行 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{formatDateJa(date)}</span>
        {report && (
          <>
            <Badge variant="secondary" className="font-normal">{report.items?.length ?? 0} 件</Badge>
            {report.reviewed_at ? (
              <Badge variant="outline" className="gap-1 border-success text-success">
                <CheckCircle2 className="h-3 w-3" /> 確認済み
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-ai text-ai">
                <Sparkles className="h-3 w-3" /> 未確認
              </Badge>
            )}
          </>
        )}
        {report && canEdit && !report.reviewed_at && (
          <Button variant="outline" size="sm" onClick={() => review.mutate(report.id)} disabled={review.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> 確認済みにする
          </Button>
        )}
      </div>

      {/* 本体 */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <NewsTable
          items={report?.items ?? []}
          reportId={report?.id}
          date={date}
          canEdit={canEdit}
          onEnsure={async () => (await ensure.mutateAsync({ kind: 'daily_news', period_key: date })).id}
        />
      )}
    </div>
  );
}

// ============ ニュース一覧 (PC=テーブル / モバイル=カード) ============

function NewsTable({ items, reportId, date, canEdit, onEnsure }: {
  items: OpsReportItem[];
  reportId?: string;
  date: string;
  canEdit: boolean;
  onEnsure: () => Promise<string>;
}) {
  const addItem = useAddItem();
  const [adding, setAdding] = useState(false);

  const submitNew = async (fields: NewsFields) => {
    const rid = reportId ?? await onEnsure();
    await addItem.mutateAsync({ reportId: rid, item: fields });
    setAdding(false);
  };

  return (
    <Card>
      <CardContent className="p-0">
        {items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-10">
            {date === toDateStr(new Date())
              ? 'この日のニュースはまだありません。AI の定期実行を待つか、下の「ニュースを追加」から登録できます。'
              : 'この日のニュースはありません。'}
          </p>
        )}

        {/* PC: テーブル */}
        {items.length > 0 && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium w-[90px]">カテゴリ</th>
                  <th className="px-2 py-2 text-center font-medium w-[52px]">AI活用</th>
                  <th className="px-2 py-2 text-center font-medium w-[64px]">採用</th>
                  <th className="px-3 py-2 text-left font-medium">要約</th>
                  <th className="px-3 py-2 text-left font-medium w-[180px]">メモ</th>
                  <th className="px-2 py-2 text-left font-medium w-[90px]">記入者</th>
                  {canEdit && <th className="px-2 py-2 w-[76px]" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <NewsRow key={item.id} item={item} canEdit={canEdit} layout="table" />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* モバイル: カード */}
        {items.length > 0 && (
          <div className="md:hidden divide-y">
            {items.map((item) => (
              <NewsRow key={item.id} item={item} canEdit={canEdit} layout="card" />
            ))}
          </div>
        )}

        {/* 追加フォーム */}
        {canEdit && (
          adding ? (
            <NewsForm
              onCancel={() => setAdding(false)}
              onSubmit={submitNew}
              submitting={addItem.isPending}
            />
          ) : (
            <div className="border-t p-2">
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4 mr-1" /> ニュースを追加
              </Button>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}

interface NewsFields {
  category: string | null;
  content: string;
  note: string | null;
  url: string | null;
  ai_related: boolean;
}

function NewsForm({ initial, onCancel, onSubmit, submitting }: {
  initial?: Partial<NewsFields>;
  onCancel: () => void;
  onSubmit: (fields: NewsFields) => void;
  submitting: boolean;
}) {
  const [category, setCategory] = useState(initial?.category ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [aiRelated, setAiRelated] = useState(initial?.ai_related ?? false);

  return (
    <div className="border-t p-3 space-y-2 bg-muted/30">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground">カテゴリ</label>
          <Input list="news-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="例: 映像" />
          <datalist id="news-categories">
            {NEWS_CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <label className="text-[11px] text-muted-foreground">URL</label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
        </div>
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">1行要約 *</label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-ring"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="ニュースの1行要約"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
        <div>
          <label className="text-[11px] text-muted-foreground">メモ (任意)</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="補足メモ" />
        </div>
        <label className="flex items-center gap-2 text-sm py-2 cursor-pointer">
          <input type="checkbox" checked={aiRelated} onChange={(e) => setAiRelated(e.target.checked)} className="h-4 w-4" />
          AI 活用に関するニュース
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>キャンセル</Button>
        <Button
          size="sm"
          disabled={!content.trim() || submitting}
          onClick={() => onSubmit({
            category: category || null,
            content,
            note: note || null,
            url: url || null,
            ai_related: aiRelated,
          })}
        >
          保存
        </Button>
      </div>
    </div>
  );
}

// ============ 行 (テーブル/カード 両対応) ============

function NewsRow({ item, canEdit, layout }: { item: OpsReportItem; canEdit: boolean; layout: 'table' | 'card' }) {
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const [editing, setEditing] = useState(false);

  const setPick = (pick: number | null) => {
    updateItem.mutate({ itemId: item.id, fields: { pick } });
  };
  const remove = async () => {
    if (!(await confirmAction({ title: 'このニュースを削除しますか？', confirmLabel: '削除する', tone: 'danger' }))) return;
    deleteItem.mutate(item.id);
  };
  const saveEdit = async (fields: NewsFields) => {
    await updateItem.mutateAsync({ itemId: item.id, fields });
    setEditing(false);
  };

  const pickPicker = canEdit ? (
    <select
      className="rounded border border-input bg-background px-1 py-0.5 text-xs"
      value={item.pick ?? ''}
      onChange={(e) => setPick(e.target.value ? Number(e.target.value) : null)}
      title="採用フラグ (1〜5)"
    >
      <option value="">—</option>
      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  ) : (
    <span className="text-xs">{item.pick ?? '—'}</span>
  );

  const contentCell = (
    <>
      <span className="whitespace-pre-wrap">{item.content}</span>
      {item.url && (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center text-primary hover:underline align-middle" title={item.url}>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </>
  );

  const recordedBy = (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {item.source === 'ai' && <Bot className="h-3 w-3 text-ai" />}
      {item.recorded_by ?? '—'}
    </span>
  );

  if (editing) {
    const form = (
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
    return layout === 'table'
      ? <tr><td colSpan={7} className="p-0">{form}</td></tr>
      : <div>{form}</div>;
  }

  if (layout === 'table') {
    return (
      <tr className="align-top">
        <td className="px-3 py-2">{item.category ? <Badge variant="secondary" className="font-normal">{item.category}</Badge> : null}</td>
        <td className="px-2 py-2 text-center">
          {item.ai_related ? <Badge variant="outline" className="border-ai text-ai px-1.5">AI</Badge> : null}
        </td>
        <td className="px-2 py-2 text-center">{pickPicker}</td>
        <td className="px-3 py-2">{contentCell}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">{item.note ?? ''}</td>
        <td className="px-2 py-2">{recordedBy}</td>
        {canEdit && (
          <td className="px-2 py-2">
            <div className="flex gap-0.5">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(true)} title="編集">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={remove} title="削除">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </td>
        )}
      </tr>
    );
  }

  // card layout (mobile)
  return (
    <div className="p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {item.category && <Badge variant="secondary" className="font-normal">{item.category}</Badge>}
        {item.ai_related && <Badge variant="outline" className="border-ai text-ai px-1.5">AI</Badge>}
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">採用 {pickPicker}</span>
      </div>
      <p className="mt-1.5 text-sm">{contentCell}</p>
      {item.note && <p className="mt-0.5 text-xs text-muted-foreground whitespace-pre-wrap">{item.note}</p>}
      <div className="mt-1.5 flex items-center justify-between">
        {recordedBy}
        {canEdit && (
          <div className="flex gap-0.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
