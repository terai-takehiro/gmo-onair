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
import type { ProjectStage } from '@/types';
import { STAGE_BADGE_LABEL } from '@/contexts/sales/pages/projectList/stages';
import {
  KIND_LABEL, phaseProgress, ymd,
  type GpmProjectDetail,
} from '../../types';

export const DETAIL_TABS = [
  { key: 'overview', label: '概要' },
  { key: 'asks', label: '未確認事項' },
  { key: 'members', label: '体制' },
  // 打合せの録音 → 文字起こし → AI の下書き。**案件と同じ表・同じサービス**
  // （`project_minutes` は `projects` にぶら下がる）。持ち帰りの行き先だけが違う
  { key: 'minutes', label: '議事録' },
  // v4 大⑤: 提出先ごとの個別見積（migration 173）
  { key: 'estimates', label: '見積' },
  // migration 179 で案件詳細から移した「月次請求（月締め）」
  { key: 'billing', label: '請求' },
  { key: 'files', label: '書類' },
] as const;

export type DetailTabKey = (typeof DETAIL_TABS)[number]['key'];

export function isDetailTab(v: string | undefined): v is DetailTabKey {
  return DETAIL_TABS.some((t) => t.key === v);
}

/**
 * スマホのタブは**段階で入れ替える**（案件詳細⑥の `MOBILE_TABS_BY_PHASE` と同じ考え方・
 * 2026-08 v4ネイティブUI化）。
 *
 * ── なぜ固定3つではだめか ────────────────────────────────────
 *
 * 7タブを 375px に並べると1タブが 40px 弱になり押し分けられないので、
 * スマホは3つに絞ります。ところが**3つを固定にすると、どの段階でも
 * 1つは使わないタブが混ざります**——
 *
 *   ・見積を出している段階（準備中）ではまだ体制も工程も定まっていないことが多い
 *   ・受注して動かしている段階（進行中）では見積のやり取りより
 *     工程・未確認事項・体制の3つを行き来する
 *   ・終わった／見送った段階（完了）では議事録と納品書類を読み返すだけになる
 *
 * 段階で入れ替えると、3つとも**その日に使うもの**になります。
 *
 * ── 段階の束ねは一覧・ダッシュボードと同じものを使う ────────────
 *
 * `types.ts` の `STAGE_GROUPS`（一覧の絞り込みチップ・サーバーの `gpm.service.ts` と共通）
 * をそのまま流用します。ここだけ別の束ね方を持つと、「一覧では進行中なのに詳細を開くと
 * 別の段階のタブが出る」がおきます。
 */
export type DetailPhase = 'planning' | 'active' | 'done';

export function gpmDetailPhase(stage: ProjectStage): DetailPhase {
  if (stage === 'a_won') return 'active';
  if (stage === 's_completed' || stage === 'e_lost') return 'done';
  return 'planning';
}

export const MOBILE_TABS_BY_PHASE: Record<DetailPhase, DetailTabKey[]> = {
  planning: ['overview', 'estimates', 'asks'],
  active: ['overview', 'asks', 'members'],
  done: ['overview', 'minutes', 'files'],
};

/**
 * **請求（月次・`BusinessProjectView` をそのまま呼ぶ）はどの段階でもスマホに出しません。**
 * 案件と共用の 2,000 行超の PC 向け表で、この回では作り直していないためです
 * （工程・体制・未確認事項・議事録・見積・書類の6タブとは違い、実測しても
 * 縦積みで読める形になっていません）。`GpmProjectDetailPage` の `everMobile` 判定は
 * この表に載っていないタブを自動でその扱いにするので、ここには載せません。
 */

/**
 * 押して切り替えられるステージ。**案件と同じ 7 段のうち、よく使う4つだけ**を出す。
 * 残り（ネタ・仮押さえ・失注）は「直す」から変える — ここに 7 つ並べると
 * 帯が横に伸びてスマホで押せなくなるうえ、押し間違いが起きやすい。
 */
const STAGE_STEPS: ProjectStage[] = ['c_proposal', 'b_verbal', 'a_won', 's_completed'];

export function DetailHeader({
  project, tab, counts, canEdit, onChangeStage, onEdit, mobile, phase,
}: {
  project: GpmProjectDetail;
  tab: DetailTabKey;
  counts: Partial<Record<DetailTabKey, number>>;
  canEdit: boolean;
  onChangeStage: (next: ProjectStage) => void;
  onEdit: () => void;
  /** スマホ。タブを3つに絞る */
  mobile?: boolean;
  /** プロジェクトの段階。**スマホのタブの組**を決める（PC は7タブのまま変えない） */
  phase: DetailPhase;
}) {
  const progress = phaseProgress(project.phases);
  const mobileKeys = MOBILE_TABS_BY_PHASE[phase];
  const tabs = DETAIL_TABS.filter((t) => !mobile || mobileKeys.includes(t.key));
  const sub = [
    project.customer_name,
    project.gpm_kind ? KIND_LABEL[project.gpm_kind] : null,
    project.pm_company ? `PM会社 ${project.pm_company}` : '自社PM',
    project.assigned_to_name ? `担当 ${project.assigned_to_name}` : null,
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
              {progress.pct === null
                ? '工程なし'
                : `${progress.pct}% ・ ${progress.done} / ${progress.count} 工程`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 px-4 lg:px-6">
        {/*
          **スマホは段階で絞った3つを均等割り**（`_rules.md` の考え方どおり、
          横スクロールにしない — スクロールすると「まだ右にタブがある」ことに
          気づけず、押されないタブができる）。PC は今までどおり7タブの横スクロール
        */}
        <div className={cn('-mb-px flex min-w-0 flex-1', !mobile && 'overflow-x-auto')}>
          {tabs.map((t) => {
            const on = t.key === tab;
            const n = counts[t.key];
            return (
              <Link
                key={t.key}
                to={`/gpm/projects/${project.id}/${t.key}`}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'min-h-tap text-list inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 lg:min-h-[44px]',
                  mobile ? 'min-w-0 flex-1 justify-center' : 'shrink-0',
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
            aria-label="ステージを変える"
          >
            {STAGE_STEPS.map((s, i) => {
              const on = s === project.stage;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { if (!on) onChangeStage(s); }}
                  aria-pressed={on}
                  className={cn(
                    'min-h-tap text-sub inline-flex items-center px-3 lg:min-h-[36px]',
                    i > 0 && 'border-l border-border',
                    on ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {STAGE_BADGE_LABEL[s]}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="text-sub mb-2 shrink-0 rounded-control border border-border px-3 py-1.5 text-muted-foreground">
            {STAGE_BADGE_LABEL[project.stage]}
          </span>
        )}
      </div>
    </div>
  );
}
