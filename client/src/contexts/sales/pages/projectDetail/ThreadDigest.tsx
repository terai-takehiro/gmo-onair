/**
 * 概要タブ / お客様とのやり取りの直近5件
 *
 * **`ThreadTab` とは別物**です。あちらは1件ずつ本文まで読む場所で、ここは
 * 「最近どんなやり取りがあったか」を**5行で掴む**ためのダイジェストです。
 */
import { CalendarClock } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { KIND } from './thread/kinds';
import { parseNextAction, nextActionLine } from './thread/nextAction';
/**
 * 期限の書き方は**やり取りタブと同じ1本**（`dueText`）。
 * 書き写すと、同じ期限が画面によって違う形で出ます（`kinds.ts` と同じ理由）。
 */
import { dueText } from './thread/NextActionNote';
import type { ActivityLog } from './types';
/** 「済み」の理由の言い方は営業活動記録と同じ1本（`ThreadCard` と同じ理由） */
import { autoClosedLabel } from '../activityLog/types';

/**
 * やり取りの直近5件 (概要タブ用のダイジェスト)
 *
 * ── 1行に潰さない ───────────────────────────────────────────
 *
 * 元はこの一覧が **日付 ＋ 1行に切り詰めた件名 ＋ 1行に切り詰めた「次:」**でした。
 * ところが**取り込んだメールの件名は長い** — AI が「★LED映像の納品仕様を照会 —
 * 先方は素材制作に着手／一方で技術打合せは未設定」のように状況ごと書くので、
 * 1行に切ると**肝心なところが必ず消えます**（利用者から「読みづらい」と指摘）。
 *
 * - **件名は2行まで**出す（`line-clamp-2`。切ると決めた切り方なので省略記号が出る）
 * - **種類を出す**（電話 / メール / 打合せ）。やり取りタブには出ていて概要には
 *   無かったので、どの経路の話か分からなかった
 * - **日付は `MM/DD` に詰め、年は変わったときだけ**出す。`2026-08-13` を毎行に
 *   出すと 10 文字が縦に並ぶだけで、同じ年の中では読む情報が2文字しかない
 * - **期限超過の「次のアクション」は赤くする**（やり取りタブと同じ判定）。
 *   ここだけ灰色のままだと、概要では対応の遅れに気づけない
 *
 * **行の区切り線は消さないこと。** 件名が2行になるので、線が無いと
 * 「どこまでが1件か」が読み取れません（元は1行だったので線が無くても読めた）。
 */
export function ThreadDigest({ items, today }: { items: ActivityLog[]; today: string }) {
  return (
    <ol className="flex flex-col">
      {items.map((a, i) => {
        const kind = KIND[a.activity_type ?? 'other'] ?? KIND.other;
        const overdue = a.next_action && !a.next_action_done_at
          && !!a.next_action_date && a.next_action_date < today;
        // 年は「前の行と違うとき」だけ出す（いちばん上の行は必ず出す）
        const prev = items[i - 1]?.activity_date;
        const showYear = i === 0 || a.activity_date?.slice(0, 4) !== prev?.slice(0, 4);
        const nextAction = parseNextAction(a.next_action);

        return (
          <li key={a.id} className="flex gap-3 border-b border-border-faint py-2.5 last:border-b-0">
            {/*
              時系列の柱。丸の位置を1行目の文字の高さに合わせる。

              ⚠️ **日付を読み上げから外さない**（レビューでの指摘 #90）。
              前の版はこの枠ごと `aria-hidden` にしていたので、読み上げでは
              **いつのやり取りか分からないまま本文だけが並んで**いました
              （やり取りは時系列がすべてなので、日付が落ちると順序の意味も消えます）。
              **飾りは飾りとして隠し、日付は `<time>` で1つの読み方にまとめます**
              （「08/14」「2026」と2つに割れていると、2つの数として読まれる）。
            */}
            <span className="flex w-11 shrink-0 flex-col items-end">
              <time
                dateTime={a.activity_date ?? undefined}
                aria-label={a.activity_date
                  ? `${a.activity_date.slice(0, 4)}年${Number(a.activity_date.slice(5, 7))}月${Number(a.activity_date.slice(8, 10))}日`
                  : undefined}
                className="flex flex-col items-end"
              >
                <span className="text-sub-sm font-number leading-5 text-muted-foreground" aria-hidden="true">
                  {a.activity_date?.slice(5).replace('-', '/')}
                </span>
                {showYear && (
                  <span className="text-note font-number text-muted-foreground" aria-hidden="true">
                    {a.activity_date?.slice(0, 4)}
                  </span>
                )}
              </time>
            </span>

            <span className="min-w-0 flex-1">
              <span className="text-note inline-flex items-center gap-1 rounded-badge bg-muted px-1.5 py-0.5 text-muted-foreground">
                <kind.icon className="h-3 w-3" aria-hidden="true" />
                {kind.label}
              </span>
              {/*
                **`block` を足さないこと。** `line-clamp-2` は clamp を効かせるために
                `display: -webkit-box` を当てるので、`block` を並べると**あとに書かれた
                ほうが勝って clamp が黙って効かなくなる**（実測: 件名が3行に伸びていた）
              */}
              <span className="text-sub mt-0.5 line-clamp-2 font-bold leading-5">{a.subject}</span>
              {a.next_action && (
                // **`text-sub-sm`(11.5px) は使わない。** スマホでも上げない段なので
                // （`shared/CLAUDE.md`。件数の数字・列見出し・バッジの札のための段）、
                // ここに当てると**読ませる文が 375px で 11.5px** になり、
                // 決めごとの「本文は 13px 以上」を割る（実測して直した）
                <span className={cn(
                  'text-sub mt-1 flex gap-1.5',
                  overdue ? 'font-bold text-destructive' : 'text-muted-foreground',
                )}>
                  <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {/* 期限の書き方は**やり取りタブと同じ関数**（`thread/NextActionNote.tsx` の
                      `dueText`）。書き写すと、同じ期限が画面によって違う形で出る */}
                  <span className="min-w-0 flex-1 line-clamp-2">
                    {/*
                      **言い切りの1文だけを出す**（`thread/nextAction.ts`）。
                      「次のアクション」は言い切り1文 ＋ 付随してやること数件で書かれているので、
                      全文を2行で切ると**2件目の途中で切れた文**が並ぶ。
                      **件数は必ず添える** — 消したのではなく続きがあることが分からないと、
                      ここで読んだつもりになって残りが見落とされる
                    */}
                    {/*
                      **AI が作った短い一文があればそちらを出す**（migration 190）。
                      無ければ規則で作った見出し。**件数は原文から数える** —
                      AI に数えさせない（数え違いに誰も気づけない）
                    */}
                    {nextActionLine(a)}
                    {nextAction.items.length > 0 && ` ほか${nextAction.items.length}件`}
                    {/*
                      ⚠️ **「過ぎています」と書かない**（`docs/wording.md` ルール8・9）。
                      利用者から「過ぎてますとかそういう表現やめろ」と明示のご指摘があった。
                      **「期限 9/18（4日超過）」**の形に統一する（和語・口語・比喩は使わない）。
                    */}
                    {` ${dueText(a, today)}`}
                    {/* 機械が閉じたものは理由を書く（`ThreadCard` と同じ1本・migration 245） */}
                    {a.next_action_done_at
                      && `（${autoClosedLabel(a.next_action_auto_closed_reason) ?? '完了'}）`}
                  </span>
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
