/**
 * ③ プロジェクト詳細の頭 — 一覧に戻る / 名前 / 状態 / タブ
 *
 * どのタブでも**同じ位置に出しつづけます**（案件詳細と同じ決め）。
 * タブごとに見出しの高さが変わると、切り替えるたびに本文が上下に跳ねて
 * 読んでいた場所を見失います。
 *
 * ── 状態は押して変える ──────────────────────────────────────
 *
 * 準備中 → 進行中 → 完了 は数えるものが変わる（ダッシュボードの
 * 「進行中プロジェクト」）ので、**変えるときに確認を出します**。
 * 確認の中身は呼ぶ側（詳細画面）が書きます。
 */
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  KIND_LABEL, STATUS_LABEL, progressPct, ymd,
  type GpmProjectDetail, type GpmStatus,
} from '../../types';

export const DETAIL_TABS = [
  { key: 'overview', label: '概要' },
  { key: 'asks', label: '未確認事項' },
  { key: 'members', label: '体制' },
] as const;

export type DetailTabKey = (typeof DETAIL_TABS)[number]['key'];

export function isDetailTab(v: string | undefined): v is DetailTabKey {
  return DETAIL_TABS.some((t) => t.key === v);
}

const STATUS_STEPS: GpmStatus[] = ['planning', 'active', 'onhold', 'done'];

export function DetailHeader({
  project, tab, counts, canEdit, onChangeStatus, onEdit,
}: {
  project: GpmProjectDetail;
  tab: DetailTabKey;
  counts: Partial<Record<DetailTabKey, number>>;
  canEdit: boolean;
  onChangeStatus: (next: GpmStatus) => void;
  onEdit: () => void;
}) {
  const pct = progressPct(project.phase_done, project.phase_count);
  const sub = [
    project.client_name,
    KIND_LABEL[project.kind],
    project.pm_company ? `PM会社 ${project.pm_company}` : '自社PM',
    project.pm_name ? `担当 ${project.pm_name}` : null,
  ].filter(Boolean).join(' ・ ');

  return (
    <div className="border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-3.5 lg:px-6">
        <Link
          to="/gpm/projects"
          aria-label="プロジェクト一覧に戻る"
          className="rounded-control-lg flex h-10 w-10 shrink-0 items-center justify-center border border-border hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
        </Link>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-h1 min-w-0 truncate" title={project.name}>{project.name}</h1>
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label="プロジェクトの内容を直す"
                title="プロジェクトの内容を直す"
                className="rounded-control-md flex h-9 w-9 shrink-0 items-center justify-center hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="text-sub mt-0.5 truncate text-muted-foreground">{sub}</p>
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-4">
          <div>
            <p className="text-th text-muted-foreground">期間</p>
            <DateRange
              start={ymd(project.started_on)}
              end={ymd(project.ends_on)}
              className="text-sub"
            />
          </div>
          <div>
            <p className="text-th text-muted-foreground">進み具合</p>
            <p className="text-sub font-number">
              {pct === null ? '工程なし' : `${pct}% ・ ${project.phase_done} / ${project.phase_count} 工程`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 px-4 lg:px-6">
        <div className="-mb-px flex min-w-0 flex-1 overflow-x-auto">
          {DETAIL_TABS.map((t) => {
            const on = t.key === tab;
            const n = counts[t.key];
            return (
              <Link
                key={t.key}
                to={`/gpm/projects/${project.id}/${t.key}`}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'min-h-tap text-list inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 lg:min-h-[44px]',
                  on ? 'border-primary text-primary' : 'border-transparent font-normal text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                {n !== undefined && n > 0 && (
                  <span className="text-badge font-number inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-chip bg-muted px-1.5 text-muted-foreground">
                    {n}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {canEdit ? (
          <div
            className="mb-2 inline-flex shrink-0 overflow-hidden rounded-control border border-border"
            role="group"
            aria-label="状態を変える"
          >
            {STATUS_STEPS.map((s, i) => {
              const on = s === project.status;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { if (!on) onChangeStatus(s); }}
                  aria-pressed={on}
                  className={cn(
                    'min-h-tap text-sub inline-flex items-center px-3 lg:min-h-[36px]',
                    i > 0 && 'border-l border-border',
                    on ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="text-sub mb-2 shrink-0 rounded-control border border-border px-3 py-1.5 text-muted-foreground">
            {STATUS_LABEL[project.status]}
          </span>
        )}
      </div>
    </div>
  );
}
