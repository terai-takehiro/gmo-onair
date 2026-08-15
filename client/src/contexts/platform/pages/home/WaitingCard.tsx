/**
 * トップページの「お待たせ中」 (v4)
 *
 * **お客様を待たせているもの**だけを、古い順に出します。
 * 自分のタスク（自分が困るだけのもの）とは分けます — 混ぜると、相手を待たせている
 * ものが自分の雑務に埋もれます。
 *
 * ── 受付（②）と同じものを見ています ──────────────────────────
 *
 * データ（`GET /dashboard/inbox`）も、見出しの作り方（`inbox/kinds.ts` の
 * `titleOf` / `subtitleOf` / `KINDS`）も**受付と同じものを使います**。
 * ここで書き写すと、片方だけ直したときにトップと受付で表記が食い違います。
 */
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import {
  KINDS, titleOf, subtitleOf, inboxHrefOf, inboxAllHrefOf, isCrossApp,
  type InboxData, type InboxOpenable,
} from '@/contexts/sales/pages/inbox/kinds';

/** トップに出すのは4件まで。**残りは件数で示して案件作成へ送る** */
const SHOWN = 4;

export function WaitingCard({ data, can }: { data: InboxData | undefined; can: InboxOpenable }) {
  const navigate = useNavigate();
  const items = data?.items ?? [];
  /** **別バンドルへは素の遷移**（`/daily/` は日常業務アプリ・ルーターでは動けない） */
  const go = (href: string) => {
    if (isCrossApp(href)) window.location.href = href; else navigate(href);
  };
  const all = inboxAllHrefOf(can);

  return (
    <section className="rounded-card flex h-full flex-col overflow-hidden border border-border bg-card">
      <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-3.5 lg:px-5">
        <h3 className="text-cardtitle">お待たせ中</h3>
        {items.length > 0 && (
          <span className="rounded-chip font-number inline-flex h-[22px] min-w-[22px] items-center justify-center bg-destructive px-1.5 text-sub-sm font-bold text-destructive-foreground">
            {items.length}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-note text-muted-foreground">古い順</span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-start gap-2 border-t border-border-subtle px-4 py-4 lg:px-5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <p className="text-sub text-secondary-foreground">
            お客様を待たせているものはありません。
          </p>
        </div>
      ) : (
        <>
          {items.slice(0, SHOWN).map((it) => {
            const kind = KINDS[it.kind];
            /* ⚠️ **行き先はその人が開ける場所。** 開けない行は押せなくする —
               押して「権限がありません」に送るのは、API の 403 を画面に
               移し替えただけ（レビューでの指摘）。中身は読めるので消さない */
            const href = inboxHrefOf(it.kind, can);
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="text-list block [overflow-wrap:anywhere]">{titleOf(it)}</span>
                  <span className="text-note block truncate text-muted-foreground">
                    {subtitleOf(it)}
                    {it.received_at && ` ・ ${formatRelativeTime(it.received_at)}`}
                  </span>
                </span>
                <TableBadge label={kind.label} w={null} className={`shrink-0 ${kind.tone}`} />
              </>
            );
            const cls = 'min-h-tap flex items-start gap-2.5 border-t border-border-subtle px-4 py-2.5 text-left lg:px-5';
            return href ? (
              <button key={it.key} type="button" onClick={() => go(href)}
                className={`${cls} hover:bg-surface-subtle`}>
                {body}
              </button>
            ) : (
              <div key={it.key} className={cls}>{body}</div>
            );
          })}
          {all && (
            <button
              type="button"
              onClick={() => go(all.href)}
              className="text-sub min-h-tap mt-auto flex items-center justify-center gap-1 border-t border-border-subtle font-bold text-primary hover:bg-surface-subtle"
            >
              {items.length > SHOWN
                ? `${all.label}で残り ${items.length - SHOWN} 件を見る`
                : `${all.label}をひらく`}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </section>
  );
}
