/**
 * やり取りの1件の「次のアクション」の枠（表示）
 *
 * ── この回で変えたこと（利用者のご指摘3）────────────────────
 *
 * 前の版は**読むだけ**でした。関係なくなった行（「見学日程打診」）を
 * 片づける手段が画面に1つも無く、**永久に残って期限超過を増やし続けます**。
 * 操作（完了 / 延期 / 編集 / 削除）を `NextActionActions.tsx` に置き、
 * 枠の中から呼べるようにしました。
 *
 * ── 面を塗るのをやめた ──────────────────────────────────────
 *
 * 前の版は期限超過を `bg-destructive-surface` の色帯で示していました。
 * ところが**期限超過でない案件のほうが多い**のに、赤い帯が並ぶと
 * 「全部が手遅れ」に見えます（ご指摘2）。
 * **白い面＋細い罫線**にし、**色は文字にだけ**使います。
 *
 * ── 言葉（`docs/wording.md` ルール8・9）────────────────────────
 *
 * ✕「（過ぎています）」→ ○「期限 9/18（4日超過）」。
 * 利用者から「過ぎてますとかそういう表現やめろ」と明示のご指摘があった箇所です。
 * 和語・口語・比喩を使わないこと。
 */
import type { ReactNode } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { InlineText } from '@gmo-onair/shared/src/client-v4/richContent';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { ActivityLog } from '../types';
/**
 * 「済み」の理由の言い方は **営業活動記録と同じ1本**（`autoClosedLabel`）。
 * ここに写すと、同じ行がやり取りタブと一覧で違う言葉になる。
 */
import { autoClosedLabel } from '../../activityLog/types';
/**
 * 期限の注記（「4日超過」「残り3日」「本日」）は**営業活動記録と同じ1本**
 * （`duePartsOf`）。**区分の定義を2か所に持たないこと** —
 * 片方だけ直すと、同じ行が一覧と詳細で違う期限の顔になります。
 */
import { duePartsOf } from '../../activityLog/dueState';
import { shortYmd } from './format';
import { parseNextAction } from './nextAction';

/**
 * この行のやることを **AI が立てたか**（ご指摘への対応・条件2）。
 *
 * ⚠️ **見分けが付かないと、直しても信号が1件も残りません。** 削除の差分は
 * `ai_outputs` に直近の出力がある行にしか積めないので、人が手で書いた行を
 * 削除しても `ai_corrections` は1行も増えません。利用者が「AI の間違いを直した」
 * つもりでいるのに材料が貯まらない、という**気づけない空振り**になるので、
 * 印のある行だけに AI の札を出します。
 *
 * 判定は**サーバーが返す `ai_generated`**（整形 or 取込の出力に `next_action` が
 * 入っているか）を優先します。これは案件別の一覧（`GET /activity-logs/by-project`）と
 * **同じ1本の判定**なので、同じ行が画面によって印の有無で食い違いません。
 * 来ていない口のときだけ `ai_output_id` →`ai_formatted` の順に代用します
 * （**MCP の取込で入っただけの行**はこの代用では印が付かないので、口を足すときは
 * `ai_generated` を一緒に返すこと）。
 */
export function isAiAuthored(a: ActivityLog): boolean {
  // サーバーが数えた値を**最優先**（整形・取込の両方を1本の判定で見ている）。
  // 来ていない口のときだけ、手元の印（出力への紐づけ・整形済み）で代用する
  if (a.ai_generated !== undefined) return a.ai_generated;
  return !!a.ai_output_id || !!a.ai_formatted;
}

/**
 * 期限の1行。**日付と注記を分けて組み立てる**（`docs/wording.md`）。
 *
 * 日付の形は `shortYmd`（やり取りタブと概要タブで同じ1本・年が違うときだけ年を出す）、
 * 注記は `duePartsOf`（営業活動記録と同じ1本）から取ります。
 * **`duePartsOf` の日付は使いません** — あちらは年を持たないので、
 * 年をまたいだ期限が「もう過ぎた日」に見えます（`format.ts` の注記）。
 */
export function dueText(a: ActivityLog, today: string): string {
  if (!a.next_action_date) return '期限未設定';
  const { note } = duePartsOf(a.next_action_date, today);
  const date = shortYmd(a.next_action_date, a.activity_date);
  return note ? `期限 ${date}（${note}）` : `期限 ${date}`;
}

/**
 * 次のアクション。
 *
 * ── 1つの段落にしない ──────────────────────────────────────
 *
 * 中身は自由文ですが、実際には**言い切り1文 ＋ 付随してやること数件**の形で
 * 書かれています（`nextAction.ts`）。1つの段落に太字で流し込むと**画面 10 行ぶんの
 * 塊**になり、しかも**期限が塊の最後**に付くので目に入りません
 * （利用者から「読みづらい」とご指摘）。
 *
 * - **見出しだけを太字**にする。全部太字は、太字を使っていないのと同じ
 * - **期限は見出しの直後**に置く。並びの後ろに回すと 10 行スクロールしないと読めない
 * - **並びは色を変えない。** 期限超過でも色が付くのは見出しと期限だけ。
 *   4行とも赤いと、何が期限超過なのか読めない
 */
export function NextAction({ a, today, children }: {
  a: ActivityLog;
  /** 本日（`YYYY-MM-DD`）。**呼ぶ側が渡す** — 開いたまま日をまたぐと基準がずれる */
  today: string;
  /** 操作の並び（`NextActionActions`）。読むだけの画面では渡さない */
  children?: ReactNode;
}) {
  const na = parseNextAction(a.next_action);
  const overdue = !a.next_action_done_at && !!a.next_action_date && a.next_action_date < today;
  const done = !!a.next_action_done_at;

  return (
    // **面は塗らない**（このファイルの冒頭）。白い面＋細い罫線で並べる
    <div className="rounded-note mt-3 flex items-start gap-2.5 border border-border-subtle px-3 py-2.5">
      <ArrowRight
        className={cn('mt-0.5 h-4 w-4 shrink-0', overdue ? 'text-destructive' : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {/*
            **`text-sub-sm`(11.5px) を使わないこと。** スマホでも上げない段なので
            （件数の数字・列見出し・バッジの札のための段）、ここに当てると
            **期限超過の知らせが 375px で 11.5px** になる。数字だけは `font-number`
          */}
          <p className={cn(
            'text-sub min-w-0 flex-1 break-words font-bold',
            done ? 'text-muted-foreground' : overdue ? 'text-destructive' : 'text-foreground',
          )}>
            <InlineText text={na.headline} />
          </p>
          {/*
            AI が立てたやることの印。**面は塗らず文字だけ**（今回の設計方針）。
            この印がある行の削除だけが、サーバー側の「時効なし」の経路を通る
          */}
          {isAiAuthored(a) && (
            <span className="text-badge inline-flex shrink-0 items-center gap-1 font-bold text-ai">
              <Sparkles className="h-3 w-3" aria-hidden="true" />AI
            </span>
          )}
        </div>

        <p className="text-sub mt-0.5 flex flex-wrap items-center gap-x-2">
          <span className={cn('font-number', overdue && !done ? 'font-bold text-destructive' : 'text-muted-foreground')}>
            {dueText(a, today)}
          </span>
          {/*
            ⚠️ **機械が閉じたものを「完了」と書かない**（migration 245）。
            案件が失注・完了に入ると、その案件のやることは自動で閉じる —
            **誰も片づけていない**ので「完了」は嘘になる。理由まで書いておけば、
            案件を戻せば開き直ることも察しがつく。改行させないので `whitespace-nowrap`
          */}
          {done && (
            <span className="whitespace-nowrap text-muted-foreground">
              {autoClosedLabel(a.next_action_auto_closed_reason) ?? '完了'}
            </span>
          )}
        </p>

        {na.items.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-1">
            {na.items.map((it, i) => (
              <li key={`${it.marker ?? ''}-${i}`} className="text-sub flex gap-1.5 text-secondary-foreground">
                {/* 印は**原文に書かれていたものだけ**。無ければ `・` を描く（番号を作らない） */}
                <span aria-hidden="true" className="shrink-0 text-muted-foreground">{it.marker ?? '・'}</span>
                <span className="min-w-0 flex-1 break-words"><InlineText text={it.text} /></span>
              </li>
            ))}
          </ul>
        )}

        {children}
      </div>
    </div>
  );
}
