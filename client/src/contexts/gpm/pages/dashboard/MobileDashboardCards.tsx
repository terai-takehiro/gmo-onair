/**
 * ① ダッシュボード — スマホのカード（GPM・2026-08・v4ネイティブUI化）
 *
 * ── きっかけ（監査）────────────────────────────────────────
 *
 * `docs/v4-native-ui-audit-2026-08-20.md`: 「『動いているプロジェクト』の行は
 * w-24/w-28 の固定幅spanを横並びさせるミニ表で、案件一覧が卒業した『PCの行を
 * そのまま縮めない』方針（`projectList/ProjectCards.tsx`）とは逆の作り」。
 *
 * ── 行を縮めたものではありません（`ProjectCards.tsx` と同じ考え方）────
 *
 * PC の行は 名前・工程・進捗バー(96px)・期限(112px) の横並びで、375px では
 * 進捗バーと期限が潰れて読めなくなります。ここではカードにして
 * **1行目 名前 → 2行目 工程・担当 → 3行目 進捗バー → 4行目 期限・未確認**
 * の縦積みにし、何も削っていません。
 */
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { dueLabel, dueTone, progressPct, ymd, type GpmOpenItem, type GpmProjectRow } from '../../types';

/** 「動いているプロジェクト」の1枚 */
export function MobileActiveProjectCard({ p, today }: { p: GpmProjectRow; today: string }) {
  const pct = progressPct(p.phase_done, p.phase_count);
  const due = ymd(p.next_due);
  return (
    <li data-flip-key={p.id}>
      <Link
        to={`/gpm/projects/${p.id}`}
        className="v4-press rounded-card flex w-full items-start gap-2.5 border border-border bg-card p-3.5 [overflow-wrap:anywhere]"
      >
        <span className="min-w-0 flex-1">
          <span className="text-list block">{p.name}</span>
          <span className="text-note mt-0.5 block truncate text-muted-foreground">
            {p.current_phase ?? '工程なし'}
            {p.assigned_to_name ? ` ・ 担当 ${p.assigned_to_name}` : ''}
          </span>

          <span className="mt-2 flex items-center gap-2">
            <span className="block h-1.5 flex-1 overflow-hidden rounded-chip bg-muted">
              <span className="v4-bar block h-1.5 rounded-chip bg-primary" style={{ width: `${pct ?? 0}%` }} />
            </span>
            <span className="text-note font-number shrink-0 text-muted-foreground">
              {pct === null ? '工程なし' : `${pct}%`}
            </span>
          </span>

          <span className="mt-1.5 flex items-center justify-between gap-2">
            <span className={cn('text-note font-number', dueTone(due, today))}>
              {dueLabel(due, today) ?? '期限なし'}
            </span>
            {p.open_items > 0 && (
              <span className="text-badge rounded-badge-xs bg-destructive-surface px-1.5 py-0.5 text-destructive">
                未確認 {p.open_items}
              </span>
            )}
          </span>
        </span>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-fg-disabled" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** 何日前に訊いたか（`GpmDashboardPage.tsx` の `daysSince` と同じ考え方だが、こちらは日数だけ受け取る） */
export function MobileStuckCard({ a, days }: { a: GpmOpenItem; days: number }) {
  return (
    <li>
      <Link
        to={`/gpm/projects/${a.project_id}/asks`}
        className="v4-press rounded-card flex w-full flex-col gap-1 border border-destructive-border bg-destructive-surface p-3.5 [overflow-wrap:anywhere]"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-list min-w-0 flex-1 truncate">{a.project_name ?? 'プロジェクト'}</span>
          <span className="text-badge font-number shrink-0 rounded-badge-xs bg-card px-1.5 py-0.5 text-destructive">
            {days}日 停止
          </span>
        </span>
        <span className="text-sub block text-foreground">{a.question}</span>
        <span className="text-note block text-destructive">{a.blocks} が止まっています</span>
      </Link>
    </li>
  );
}

/** 「未確認事項」の1枚 */
export function MobileOpenAskCard({
  a, days, toLabel,
}: {
  a: GpmOpenItem;
  days: number;
  /** `TO_KIND_LABEL[a.to_kind]` を呼ぶ側から渡す（一覧側の対応表を書き写さない） */
  toLabel: string;
}) {
  return (
    <li>
      <Link
        to={`/gpm/projects/${a.project_id}/asks`}
        className="v4-press rounded-card flex w-full flex-col gap-1 border border-border bg-card p-3.5 [overflow-wrap:anywhere]"
      >
        <span className="text-list block">{a.question}</span>
        <span className="text-note block text-muted-foreground">
          {[toLabel, a.to_name].filter(Boolean).join(' ')}
          {' ・ '}
          <span className="font-number">{days}</span>日前から待ち
        </span>
        {a.blocks && <span className="text-note block text-destructive">{a.blocks} が止まっています</span>}
      </Link>
    </li>
  );
}
