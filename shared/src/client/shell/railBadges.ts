// shared/src/client/shell/railBadges.ts — レールに出す件数 (v3.1.0)
//
// ── なぜ必要だったか ───────────────────────────────────────
//
// `Rail.tsx` には最初からバッジを描く仕掛け (`badges` prop と `<Badge>`) があり、
// `AppShell` も `railBadges` を受け取れるようになっていた。
// ところが **7つのアプリのどれも渡していなかった** — 仕掛けだけがあって、
// 数は1度も出ていなかった。
//
// 結果として「お客様を3日待たせている」「依頼の返事が来ていない」に気づくには
// **上辺のベルを開くしかない**。レールは常に見えているのに何も言わないので、
// 開く理由がない人は開かない。
//
// 通知は既にベルが2分ごとに取っているので、**その結果を配り直すだけ**にする
// (同じ数字を2か所で数えない = 二重取得も防ぐ)。

import type { NotificationData } from '../notifications';

/**
 * 通知のグループ → レールの項目。
 *
 * **どのレールを押せば片づくか**で割り当てる。「お客様を待たせている」は
 * 待たせているものの行列 = 今日、「名前を呼ばれた」は案件のコメント = 案件、
 * 「依頼の返事」はタスク、「今日の現場」は予定。
 */
const GROUP_TO_RAIL: Record<string, string> = {
  waiting: 'today',
  ai: 'today',
  mention: 'projects',
  delegation: 'tasks',
  today: 'schedule',
};

export function railBadgesFromNotifications(
  data: NotificationData | null | undefined,
): Record<string, number> | undefined {
  if (!data?.groups?.length) return undefined;
  const out: Record<string, number> = {};
  for (const g of data.groups) {
    const key = GROUP_TO_RAIL[g.key];
    if (!key) continue;
    out[key] = (out[key] ?? 0) + (g.items?.length ?? 0);
  }
  // 1つも割り当てられなかったら「バッジ無し」を返す (空のオブジェクトを渡さない)
  return Object.keys(out).length > 0 ? out : undefined;
}
