/**
 * 「AI が読んだページ」と回答のルール（docs/design/v4/wiki.md §6-⑤ の右の欄）
 *
 * ⚠️ **読んだページと出典は別のものです。** 読んだのは材料に渡した上位8ページ、
 * 出典は AI が引用として返し、**本文に実在したもの**だけ（§7-1 ②）。
 * ここでは印で区別し、混ぜて数えません。
 *
 * ⚠️ **`via='answer'` を記録するのは出典として挙がったページだけ**です
 * （§7-3 条件3 は「出典が開かれた率」。材料に渡しただけのページを混ぜると、
 * 分子が水増しされて「役に立った」が読めなくなります）。
 */
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { recordAnswerView, type AskMaterial } from '@/components/search/askApi';
import { cn } from '@/lib/utils';

export interface AskMaterialsPanelProps {
  materials: AskMaterial[];
  /** 出典として挙がったページ（印を付ける） */
  citedIds: Set<string>;
  /** 出典を結ぶ相手（いちばん新しい回答の `ai_outputs.id`） */
  answerOutputId: string | null;
  /** 1件も無いときに出す1行。状態によって言うことが違うので画面が決める */
  emptyNote: string;
  className?: string;
}

export default function AskMaterialsPanel({
  materials,
  citedIds,
  answerOutputId,
  emptyNote,
  className,
}: AskMaterialsPanelProps) {
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex shrink-0 items-baseline gap-2 border-b border-border px-3 py-2.5">
        <h2 className="text-cardtitle text-foreground">AI が読んだページ</h2>
        <span className="font-number text-sub-sm text-muted-foreground">
          {materials.length} ／ 出典 {citedIds.size}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {materials.length === 0 ? (
          <p className="px-1.5 py-2 text-sub leading-relaxed text-muted-foreground">{emptyNote}</p>
        ) : (
          materials.map((m) => {
            const cited = citedIds.has(m.page_id);
            return (
              <Link
                key={m.page_id}
                to={`/p/${m.page_id}`}
                onClick={() => { if (cited) recordAnswerView(m.page_id, answerOutputId); }}
                className="flex min-h-tap items-center gap-2 rounded-control px-1.5 py-1 no-underline hover:bg-primary-surface-weak lg:min-h-0 lg:py-1.5"
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-badge-xs',
                    cited ? 'bg-success-surface' : 'bg-muted',
                  )}
                  aria-hidden
                >
                  {cited && <Check className="h-3 w-3 text-success" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sub text-foreground">{m.title}</span>
                  <span className="block truncate text-sub-sm text-muted-foreground">
                    {m.path || '—'}
                    {m.from_context ? ' ・ 開いていたページ' : ''}
                  </span>
                </span>
              </Link>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-t border-border px-3 py-2.5">
        <h3 className="mb-1 text-th text-secondary-foreground">回答のルール</h3>
        <ul className="list-disc pl-4 text-sub-sm leading-relaxed text-muted-foreground">
          <li>Wiki の記載だけを根拠にし、出典を必ず付ける</li>
          <li>出典が出せない質問には答えず、足りないページに登録する</li>
          <li>下書き・一覧から隠したページ・読めないスペースは材料にしない</li>
        </ul>
      </div>
    </div>
  );
}
