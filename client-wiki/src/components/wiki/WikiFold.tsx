/**
 * 折りたたみ（`<details><summary>…</summary> … </details>`。設計 §4-2）
 *
 * 長い補足を畳む（Notion のトグルにあたるもの）。**本文はそのままの HTML** で、
 * 色と手触りを付けて描くのは画面の仕事（注意書きと同じ約束1）。
 * 書き出した `.md` を GitHub で開いても折りたたみとして読める。
 *
 * ⚠️ `rehype-raw` を入れて生の HTML を描かせる、という直し方はしない。
 *    本文には AI が書いたものも人が書いたものも入るので、`<script>` や
 *    `onerror` を素通しにする口を開けない（§7-5）。
 */
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export default function WikiFold({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group my-4 rounded-note border border-border bg-surface-subtle px-3 py-1">
      <summary className="flex min-h-tap cursor-pointer list-none items-center gap-2 text-list text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span className="min-w-0 flex-1">{summary || '補足'}</span>
      </summary>
      <div className="border-t border-border pb-2 pt-2">{children}</div>
    </details>
  );
}
