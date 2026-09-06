/**
 * トップページの「受信箱」タブの中身（`TaskHubCard` から呼ばれる）
 *
 * ── 旧「お待たせ中」の作り直し（根源整理 Phase 1・docs/core-redesign-plan.md §3-3）──
 *
 * `GET /dashboard/inbox` の4種（AI起票ネタ／期限超過／問い合わせ／書類）は
 * 性質も消し方も別々のもので、「お待たせ中」という言葉だけで束ねた1本の
 * リストでは「次に何をすればよいか」が行ごとに変わって読めなかった。
 *
 *  1. **種類ごとの節に分けて出す**（`KIND_ORDER` の順・0件の節は出さない）
 *  2. **行にその場のアクションを置く**: AI起票ネタは「不要」（見送り＝AI の
 *     教師データになる・`inbox/useInboxActions.ts`）、期限超過は「済んだ」
 *     （既存の次回アクション完了の口）。開くだけの行を無くす
 *  3. **脚注の「残りN件」は counts（実数）から計算する。** `items` は種類ごとに
 *     上限つきなので、`items.length` から引くと同一カード内でバッジ
 *     （counts.total）と食い違っていた
 *
 * ファイルを分けているのは 1ファイル400行の上限のため（`TaskHubCard.tsx` に
 * 同居させると超える）。タブの枠・切替は `TaskHubCard` が持つ。
 */
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import {
  KINDS, KIND_ORDER, titleOf, subtitleOf, inboxHrefOf, inboxAllHrefOf, isCrossApp,
  type InboxData, type InboxItem, type InboxOpenable,
} from '@/contexts/sales/pages/inbox/kinds';
import { useDismissAiProject } from '@/contexts/sales/pages/inbox/useInboxActions';
import { useAdvanceFinanceDoc, nextStepOf, type InboxDocStatus } from '@/contexts/sales/pages/inbox/useFinanceDocActions';
import { TODAY_SALES_KEY } from '@/contexts/platform/pages/salesDashboard/TodaySalesCard';
import { useNextActionActions } from '@/contexts/sales/pages/activityLog/useNextActionActions';

/** 1つの節に出す行数。節が4つ全部あっても縦がカード1枚に収まる量 */
const PER_KIND = 3;

export function InboxTab({ data, can }: { data: InboxData | undefined; can: InboxOpenable }) {
  const navigate = useNavigate();
  const items = data?.items ?? [];
  const counts = data?.counts;
  const dismiss = useDismissAiProject();
  /*
    **受領書類はその場で1歩進められる**（2026-09 のご指示）。
    押すと受信箱・受領書類の一覧・アプリのバッジが同時に落ちるので、
    **誰かひとりが対応すれば他の人の画面からも消えます**。
  */
  const advanceDoc = useAdvanceFinanceDoc();
  /**
   * 「済んだ」は既存の次回アクション完了の口（`POST /activity-logs/:id/
   * complete-next-action`）をそのまま使う。受信箱の鍵と、同じ行を持つ
   * ダッシュボードの「今日の営業」・帯の件数も一緒に落とす
   * （片方だけだと「済んだのに残っている」に見える）。
   * ※ 旧「期限超過の次の一手」パネル（overdue-actions 鍵）は Phase 2 で
   *   「今日の営業」カードに吸収されたので、落とす鍵もそちらに替えた。
   */
  const nextAction = useNextActionActions([
    [...queryKeys.dashboard.inbox()],
    [...TODAY_SALES_KEY],
    ['dashboard', 'sales-overview'],
  ]);
  /** **別バンドルへは素の遷移**（`/daily/` は日常業務アプリ・ルーターでは動けない） */
  const go = (href: string) => {
    if (isCrossApp(href)) window.location.href = href; else navigate(href);
  };
  const all = inboxAllHrefOf(can);

  // 種類ごとの節（0件の節は出さない）。各節の中は届いた順
  // （`items` が received_at 昇順で来る）のまま
  const sections = KIND_ORDER
    .map((kind) => ({ kind, rows: items.filter((i) => i.kind === kind) }))
    .filter((s) => s.rows.length > 0);
  const shownCount = sections.reduce((n, s) => n + Math.min(s.rows.length, PER_KIND), 0);
  // **「残りN件」は counts（実数）から**（冒頭コメントの 3）
  const remaining = Math.max(0, (counts?.total ?? 0) - shownCount);

  return (
    <>
      <div className="flex justify-end">
        <span className="text-note text-muted-foreground">節ごとに古い順</span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-start gap-2 border-t border-border-subtle pt-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <p className="text-sub text-secondary-foreground">
            受信箱に届いているものはありません。
          </p>
        </div>
      ) : (
        <>
          {sections.map(({ kind, rows }) => {
            const def = KINDS[kind];
            const Icon = def.icon;
            return (
              <div key={kind} className="mt-1.5 first:mt-0.5">
                {/* 節の見出し。件数は counts（実数）— 節の行数と違うことがある */}
                <p className="text-th flex items-center gap-1.5 font-bold text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {def.label}
                  <span className="font-number">{counts?.[kind] ?? rows.length}</span>
                </p>
                {rows.slice(0, PER_KIND).map((it) => (
                  <InboxRow
                    key={it.key}
                    item={it}
                    can={can}
                    go={go}
                    onDismiss={dismiss.dismiss}
                    dismissPending={dismiss.isPending}
                    onDone={nextAction.complete}
                    donePending={nextAction.isPending}
                    onAdvanceDoc={advanceDoc.advance}
                    advanceDocPending={advanceDoc.isPending}
                    canEditDocs={can.documentsEdit}
                  />
                ))}
              </div>
            );
          })}
          {all && (
            <button
              type="button"
              onClick={() => go(all.href)}
              className="text-sub min-h-tap mt-auto flex items-center justify-center gap-1 border-t border-border-subtle pt-2.5 font-bold text-primary hover:bg-surface-subtle"
            >
              {remaining > 0
                ? `${all.label}で残り ${remaining} 件を見る`
                : `${all.label}を開く`}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </>
  );
}

/**
 * 受信箱の1行。**遷移とアクションは別のボタン**（兄弟要素）にする —
 * 行全体を `<button>` にしたまま中にボタンを入れると HTML として壊れる
 * （入れ子のボタンはクリックがどちらに飛ぶか環境で変わる）。
 */
function InboxRow({
  item, can, go, onDismiss, dismissPending, onDone, donePending,
  onAdvanceDoc, advanceDocPending, canEditDocs,
}: {
  item: InboxItem;
  can: InboxOpenable;
  go: (href: string) => void;
  onDismiss: (projectId: string, name?: string | null) => void;
  dismissPending: boolean;
  onDone: (activityId: string) => void;
  donePending: boolean;
  onAdvanceDoc: (p: { id: string; status: 'reviewing' | 'approved' }) => void;
  advanceDocPending: boolean;
  /** `PUT /dailyops/finance-docs/:id` は `dailyops` か `sales` の editor を要求する */
  canEditDocs: boolean;
}) {
  /* ⚠️ **行き先はその人が開ける場所。** 開けない行は押せなくする —
     押して「権限がありません」に送るのは、API の 403 を画面に
     移し替えただけ（レビューでの指摘）。中身は読めるので消さない */
  const href = inboxHrefOf(item, can);
  const body = (
    <span className="min-w-0 flex-1">
      <span className="text-list block [overflow-wrap:anywhere]">{titleOf(item)}</span>
      <span className="text-note block truncate text-muted-foreground">
        {subtitleOf(item)}
        {item.received_at && ` ・ ${formatRelativeTime(item.received_at)}`}
      </span>
    </span>
  );

  /*
   * 行アクション。**どちらの口もサーバーが `sales` の editor を要求する**
   * （`PATCH /projects/:id/stage`・`POST /activity-logs/:id/complete-next-action`）
   * ので、判定は `can.intake`（= sales editor）。`viewProjects`（閲覧）とは
   * 要求が違うことに注意 — 開ける人にも押せない人はいる。
   * 「不要」は **AI起票の行（kind='ai_project'）にだけ**出す — この一覧の
   * ai_project は全行 AI 起票（`AI_INBOX_SQL` が起票者で絞る）なので kind で足りる。
   */
  const action = (() => {
    if (!can.intake) return null;
    if (item.kind === 'ai_project') {
      const id = typeof item.meta.id === 'string' ? item.meta.id : null;
      if (!id) return null;
      return (
        <RowActionButton
          label="不要"
          tone="destructive"
          disabled={dismissPending}
          onClick={() => onDismiss(id, typeof item.meta.name === 'string' ? item.meta.name : null)}
        />
      );
    }
    if (item.kind === 'overdue_action') {
      const id = typeof item.meta.activity_id === 'string' ? item.meta.activity_id : null;
      if (!id) return null;
      return (
        <RowActionButton
          label="済んだ"
          tone="success"
          disabled={donePending}
          onClick={() => onDone(id)}
        />
      );
    }
    return null;
  })();

  /*
    受領書類だけは**別の権限**（`dailyops` か `sales` の editor）で動くので、
    `can.intake`（= `sales` editor）で束ねた上の判定とは分けて出す。
    ⚠️ **却下はここに置かない** — スクロール中に押してしまった請求書が
    誰の目にも触れなくなる。却下は中身を開ける受領書類の画面だけにある。
  */
  const docAction = (() => {
    if (item.kind !== 'finance_doc' || !canEditDocs) return null;
    const id = typeof item.meta.id === 'string' ? item.meta.id : null;
    const step = nextStepOf(item.meta.status as InboxDocStatus | undefined);
    if (!id || !step) return null;
    return (
      <RowActionButton
        label={step.label}
        tone="success"
        disabled={advanceDocPending}
        onClick={() => onAdvanceDoc({ id, status: step.to })}
      />
    );
  })();

  return (
    <div className="flex items-center gap-1.5 border-t border-border-subtle">
      {href ? (
        <button
          type="button"
          onClick={() => go(href)}
          className="min-h-tap flex min-w-0 flex-1 items-start gap-2.5 py-2 text-left hover:bg-surface-subtle"
        >
          {body}
        </button>
      ) : (
        <div className="min-h-tap flex min-w-0 flex-1 items-start gap-2.5 py-2">{body}</div>
      )}
      {action}
      {docAction}
    </div>
  );
}

/**
 * 行アクションのボタン。**スマホは 44px**（押し間違えると取り消し操作に行く）。
 * `stopPropagation` は兄弟構造なので本来届かないが、将来行側に onClick が
 * 付いても遷移を巻き込まないよう明示して止める。
 */
function RowActionButton({
  label, tone, disabled, onClick,
}: {
  label: string; tone: 'destructive' | 'success'; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`min-h-tap rounded-control text-sub shrink-0 border px-2.5 py-1 font-bold disabled:opacity-50 lg:min-h-0 ${
        tone === 'destructive'
          ? 'border-border text-destructive hover:bg-destructive-surface'
          : 'border-border text-success hover:bg-success-surface'
      }`}
    >
      {label}
    </button>
  );
}
