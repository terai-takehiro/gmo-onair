/**
 * デイリーニュース報告 — 1件の入力欄 (追加と編集で同じもの) (v4)
 *
 * 追加と編集で別々に書くと、片方にだけ項目が増えて食い違う
 * (実際に旧実装は編集からは URL を消せたのに、追加では必須でなかった)。
 *
 * ── ボトムシート化した（v4ネイティブUI監査 2026-08-20） ─────────
 *
 * 以前はこのフォームを `Row` の位置にそのまま展開するインライン展開だった
 * （追加は一覧の下、編集はその行の場所に）。スマホでは一覧が縦に伸びた分だけ
 * フォームが押し下げられ、開いた場所も画面によってバラバラだった。
 * `shared/src/client-v4/formDialog.tsx` の `<FormDialog>`（`<Sheet>` の薄いラッパー）
 * に載せ替え、**スマホは下シート・PC は中央ダイアログ**で開く形に統一した。
 * 呼び出し側（`DailyNewsPage.tsx` の追加・`NewsRows.tsx` の編集）は
 * `initial`/`onCancel`/`onSubmit`/`submitting` のprops をそのまま渡しているだけで、
 * マウントするかどうかの条件分岐は変えていない。
 */
import { useEffect, useState } from 'react';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
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

  // **呼び出し元は毎レンダーで `initial` を新しいオブジェクトとして作り直す**
  // （`{ category: item.category, ... }` の形。参照では変化を判定できない）ので、
  // 中身の値を依存にして再同期する。開いたまま裏で一覧が invalidate されて
  // `item` の値が変わっても、フォームが古い値のまま保存してしまうのを防ぐ
  useEffect(() => {
    setCategory(initial?.category ?? '');
    setContent(initial?.content ?? '');
    setUrl(initial?.url ?? '');
    setNote(initial?.note ?? '');
    setAiRelated(initial?.ai_related ?? false);
  }, [initial?.category, initial?.content, initial?.url, initial?.note, initial?.ai_related]);

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onCancel(); }}
      title={initial ? 'ニュースを直す' : 'ニュースを足す'}
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onCancel}>やめる</Button>
          <Button
            disabled={!content.trim() || submitting}
            onClick={() => onSubmit({
              category: category || null,
              content,
              note: note || null,
              url: url || null,
              ai_related: aiRelated,
            })}
          >
            {initial ? '保存' : '足す'}
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
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
      </div>
    </FormDialog>
  );
}
