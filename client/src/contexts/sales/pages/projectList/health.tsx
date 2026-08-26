/**
 * 案件の健全性バッジ（docs/core-redesign-plan.md §3-1）
 *
 * ── 「止まっている」（クライアント7日ハードコード）をやめた ──────
 *
 * 旧実装は `isStale`（この画面だけの7日判定）で「止まっている」1種類の
 * 赤バッジを出していました。判定がサーバーの「おすすめ順」と別の場所にあり、
 * ステージも生存証拠（未来の次回アクション・期日が未来のタスク・スヌーズ）も
 * 見ていないので、**受注済で正しく静かな案件まで赤くなる**ことがありました。
 *
 * → 判定は **`GET /projects` が返す `health`**（サーバー1か所 =
 *   `server/src/contexts/sales/services/project-health.ts`）だけを使います。
 *   クライアントで日数を数え直さないこと — 数え直すと PC とスマホと
 *   サーバーの並び順で違う案件が赤くなります。
 *
 * 3表示（`ok` は何も出さない — 静かな案件に印を付けると印の意味が薄まる）:
 *   期限超過 (`overdue`) … 次の一手の期日が過去。最優先なので赤
 *   停滞 (`stalled`)     … 次の一手が無いままステージ別しきい値超過。
 *                          「放置◯日」を数字で見せる（何日忘れているかが行動を決める)
 *   スヌーズ中 (`snoozed`) … 意図して寝かせている。再開日を添えて**静かな色**にする
 *
 * リスト・カード・ボードの3か所がこの1部品を使います。**写しを作らない** —
 * 片方だけ文言や色を変えると、同じ案件が画面によって違う状態に見えます。
 */
import { AlarmClock } from 'lucide-react';
import type { ProjectListRow } from './types';

/** 「9/10」の形。スヌーズの再開日は年を出さない（未来の日付しか入らない） */
function shortDate(ymd: string): string {
  return ymd.slice(5).replace(/^0/, '').replace('-', '/').replace('/0', '/');
}

export function HealthBadge({
  p,
}: {
  p: Pick<ProjectListRow, 'health' | 'stalled_days' | 'snooze_until'>;
}) {
  if (p.health === 'overdue') {
    return (
      <span className="text-badge shrink-0 rounded-badge-xs bg-destructive-surface px-1.5 py-0.5 font-bold text-destructive">
        期限超過
      </span>
    );
  }
  if (p.health === 'stalled') {
    return (
      <span className="text-badge shrink-0 rounded-badge-xs bg-warning-surface px-1.5 py-0.5 text-warning">
        停滞{p.stalled_days != null ? ` ・ 放置${p.stalled_days}日` : ''}
      </span>
    );
  }
  if (p.health === 'snoozed' && p.snooze_until) {
    return (
      <span className="text-badge inline-flex shrink-0 items-center gap-0.5 rounded-badge-xs bg-muted px-1.5 py-0.5 text-muted-foreground">
        <AlarmClock className="h-3 w-3" aria-hidden="true" />
        スヌーズ 〜{shortDate(p.snooze_until)}
      </span>
    );
  }
  return null;
}
