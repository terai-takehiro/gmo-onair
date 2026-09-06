/**
 * 書類の中身を開いて読む（⑥ 受領書類・v4）
 *
 * ── なぜ足したか ────────────────────────────────────────────
 *
 * `record_finance_doc`（MCP）は毎回 `content`（内容の要約）を書いているのに、
 * **v4 の一覧はそれを1か所も描いていませんでした**。承認する人には
 * 件名と金額しか届いておらず、中身を知るには元のメールを探しに行くしかありませんでした。
 *
 * ── 行に足さずに「開く」形にした理由 ────────────────────────
 *
 * 一覧の行に本文を出すと、行の高さが中身の量でバラバラになり、
 * **金額の桁が縦にそろわなくなります**（v4 の整列の規律そのもの）。
 * 開く形なら、読む必要があるときだけ広がります。
 *
 * ── 「読める形」と「素のテキスト」の両方を出す ──────────────
 *
 * `details`（migration 160）は AI が項目に分けて渡してきたもの。
 * **古い行は持っていない**ので、無いときは `content` の自由文をそのまま出します
 * （過去のぶんを消さない）。原文（`body_text`）は畳んで置きます。
 *
 * ── 原文はそのとき取りに行く（migration 281）──────────────
 *
 * 束の一覧は**原文を運びません**。この画面は絞り込み無しで全部の束を引き、
 * **15秒ごとに取り直す**ので、切り詰めていない原文（1通 1〜3KB）を載せると
 * **開きっぱなしの画面が1日中それを運び続けます**。
 * 一覧は「原文があるか」だけを返し、**開いたときに1件だけ**取りに行きます。
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Sparkles, FileText } from 'lucide-react';
import api from '@/lib/api';
import { RichContent } from '@gmo-onair/shared/src/client-v4/richContent';
import type { FinanceDoc } from './types';

export function DocDetails({ doc, open, onToggle }: { doc: FinanceDoc; open: boolean; onToggle: () => void }) {
  const hasRich = !!doc.details && doc.details.length > 0;
  const hasText = !!(doc.content || doc.notes);
  // 一覧は有無だけ返す。1件だけ読む口（`getById`）は原文そのものを返す
  const hasBody = !!doc.body_text || !!doc.has_body_text;
  /** 「メールの原文を見る」を開いたか。**開くまで取りに行かない** */
  const [wantBody, setWantBody] = useState(false);

  const body = useQuery<{ data: FinanceDoc }>({
    queryKey: ['finance-doc', doc.id],
    queryFn: async () => (await api.get(`/dailyops/finance-docs/${doc.id}`)).data,
    // 一覧が原文を持っているとき（1件読みの結果）は取りに行かない
    enabled: wantBody && !doc.body_text,
    staleTime: 5 * 60_000,
  });
  const bodyText = doc.body_text ?? body.data?.data.body_text ?? null;

  if (!hasRich && !hasText && !hasBody) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="text-note min-h-tap inline-flex items-center gap-1 text-primary lg:min-h-[32px]"
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
        {open ? '中身を閉じる' : '中身を読む'}
        {hasRich && (
          <Sparkles className="h-3 w-3 text-ai" aria-label="AI が項目に分けて読み取りました" />
        )}
      </button>

      {open && (
        <div className="rounded-control-lg mt-1.5 flex flex-col gap-3 border border-border bg-card p-3">
          <RichContent blocks={doc.details} fallback={doc.content} />

          {doc.notes && (
            <p className="text-sub whitespace-pre-line text-secondary-foreground">{doc.notes}</p>
          )}

          {hasBody && (
            <details onToggle={(e) => setWantBody((e.target as HTMLDetailsElement).open)}>
              <summary className="text-note min-h-tap flex cursor-pointer items-center gap-1 text-muted-foreground lg:min-h-[32px]">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                メールの原文を見る
              </summary>
              {/* **原文は要約と別に持っている。** AI がどこを読み違えたかを
                  その場で確かめられるようにするため（切り詰めていない）。
                  **取りに行くのは開いたときだけ**（一覧は運ばない） */}
              <pre className="text-note mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-note bg-muted p-2 text-secondary-foreground">
                {bodyText ?? (body.isError ? '原文を読み込めませんでした。' : '読み込み中…')}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
