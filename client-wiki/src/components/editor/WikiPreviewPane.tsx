/**
 * プレビュー（読む人からどう見えるか）
 *
 * ⚠️ **描くのは段A の `WikiMarkdown` をそのまま使います。** 編集画面のために
 * 別の描き手を作ると、注意書き・折りたたみ・ONAiR カードの見え方が2通りになり、
 * 「書いているときは出たのに、保存したら出ない」が起きます。
 *
 * 本文の先頭の見出しが題と同じときに落とすのも、読む画面と同じ `bodyForDisplay`。
 */
import WikiMarkdown from '@/components/wiki/WikiMarkdown';
import { bodyForDisplay } from '@/lib/wikiBody';

export default function WikiPreviewPane({ title, body }: { title: string; body: string }) {
  const shown = bodyForDisplay(body, title);

  return (
    <aside className="hidden min-w-0 flex-1 flex-col border-l border-border bg-card lg:flex">
      <div className="flex h-9 shrink-0 items-center border-b border-border px-6 text-sub-sm text-muted-foreground">
        プレビュー
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto w-full max-w-[720px]">
          <div className="mb-3 text-h1 text-foreground">{title || '題名'}</div>
          {shown.trim()
            ? <WikiMarkdown body={shown} />
            : <p className="text-sub text-muted-foreground">左に打った内容が、読む人にはここに見えるとおりに出ます。</p>}
        </div>
      </div>
    </aside>
  );
}
