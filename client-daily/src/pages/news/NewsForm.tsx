/**
 * デイリーニュース報告 — 1件の入力欄 (追加と編集で同じもの) (v4)
 *
 * 追加と編集で別々に書くと、片方にだけ項目が増えて食い違う
 * (実際に旧実装は編集からは URL を消せたのに、追加では必須でなかった)。
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NEWS_CATEGORIES } from '@/lib/types';

export interface NewsFields {
  category: string | null;
  content: string;
  note: string | null;
  url: string | null;
  ai_related: boolean;
}

export function NewsForm({
  initial, onCancel, onSubmit, submitting,
}: {
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
    <div className="flex flex-col gap-2 border-t border-border-subtle bg-surface-subtle p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="text-th text-muted-foreground" htmlFor="news-category">分類</label>
          <Input
            id="news-category"
            list="news-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="例: 映像"
          />
          <datalist id="news-categories">
            {NEWS_CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <label className="text-th text-muted-foreground" htmlFor="news-url">元の記事の URL</label>
          <Input id="news-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
        </div>
      </div>

      <div>
        <label className="text-th text-muted-foreground" htmlFor="news-content">1行の要約 *</label>
        <textarea
          id="news-content"
          className="text-sub min-h-[60px] w-full rounded-control border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="ニュースの1行の要約"
        />
      </div>

      <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2">
        <div>
          <label className="text-th text-muted-foreground" htmlFor="news-note">メモ (任意)</label>
          <Input id="news-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="補足のメモ" />
        </div>
        <label className="text-sub min-h-tap flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={aiRelated}
            onChange={(e) => setAiRelated(e.target.checked)}
            className="h-4 w-4"
          />
          AI 活用に関するニュース
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" className="min-h-tap" onClick={onCancel}>やめる</Button>
        <Button
          className="min-h-tap"
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
