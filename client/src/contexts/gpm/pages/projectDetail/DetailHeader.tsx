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
 *
 * ── 案件詳細⑥の作法に揃えた（PR③・`gpm-format-alignment.html` 項目7〜11）─
 *
 * タブ定義・段階の判定は `tabs.ts` に切り出した（項目7）。ここは3行構成:
 *   1行目 … 戻る／名前／サブ ＋ 右上の主アクション（＋タスクを追加、PCのみ）
 *   2行目 … ステージ帯（記号＋名前・104px 等幅 ＋ 完了/失注は60px の別組・
 *           横に滑るレール）＋ 右端の「最後の更新」（項目9・10）
 *   3行目 … タブ。PC も `flex-1` の均等割りにして横スクロールをやめた（項目8）
 * 期間・進み具合の数値は本文（`GpmProjectDetailPage` の事実の帯）へ移した（項目10）。
 * スマホは名前を `truncate` でなく `[overflow-wrap:anywhere]` で折り返す（項目11）。
 *
 * サブの組み立て（依頼元・区分・PM会社・自社担当）・タブ定義・段階の考え方は
 * **言葉づかいを変えていない**（このPRの対象外。文面はそのまま移しただけ）。
 *
 * ── コストセンター（GMO）だけ「請求」→「予算と実績」（2026年10月の事業再編・P3）──
 *
 * `isCostCenter` を受け取り、タブの表示ラベルだけを差し替える（`key` は
 * 変えない——変えると「請求」で開いていたブックマーク・共有 URL が壊れる）。
 * スマホのタブ構成も `effectiveMobileTabs()`（`tabs.ts`）に `isCostCenter` を渡し、
 * レスポンシブに作った `BudgetTab` だけ全段階のスマホ帯に含める。
 */
import { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { useRail } from '@gmo-onair/shared/src/client-v4/rail';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { Button } from '@/components/ui/button';
import type { ProjectStage } from '@/types';
import { STAGE_BADGE_LABEL } from '@/contexts/sales/pages/projectList/stages';
import { KIND_LABEL, type GpmProjectDetail } from '../../types';
import {
  DETAIL_TABS, effectiveMobileTabs, STAGE_STEPS, END_STEPS,
  type DetailTabKey, type DetailPhase,
} from './tabs';

/** 進める段の記号（`STAGE_BADGE_LABEL` は和文だけなので、記号はここで足す） */
const STAGE_SYMBOL: Partial<Record<ProjectStage, string>> = {
  c_proposal: 'C', b_verbal: 'B', a_won: 'A', r_delivered: 'R',
};

/** 終わり方の短い名前（帯に置くのは記号なしの2文字。正式名はツールチップで見せる） */
const END_SHORT: Partial<Record<ProjectStage, string>> = { s_completed: '完了', e_lost: '失注' };

/** ステージ帯の寸法（案件詳細⑥と同じ物差し）。**選んでも動かないための等幅** */
const STAGE_W = 'w-[104px]';  // ui-tokens-ok: 進める4段を等幅にする（記号＋名前が入る幅）
const END_W = 'w-[60px]';     // ui-tokens-ok: 完了・失注。2文字ぶん

/** サブの文言（依頼元・区分・PM会社・自社担当）。**既存のまま**、切り出しただけ */
function projectSub(project: GpmProjectDetail): string {
  return [
    project.customer_name,
    project.gpm_kind ? KIND_LABEL[project.gpm_kind] : null,
    project.pm_company ? `PM会社 ${project.pm_company}` : '自社PM',
    project.assigned_to_name ? `担当 ${project.assigned_to_name}` : null,
  ].filter(Boolean).join(' ・ ');
}

export function DetailHeader({
  project, tab, counts, canEdit, onChangeStage, onEdit, mobile, phase, isCostCenter = false,
}: {
  project: GpmProjectDetail;
  tab: DetailTabKey;
  counts: Partial<Record<DetailTabKey, number>>;
  canEdit: boolean;
  onChangeStage: (next: ProjectStage) => void;
  onEdit: () => void;
  /** スマホ。タブを3つに絞り、名前の折り返し・主アクションの出し方を変える */
  mobile?: boolean;
  /** プロジェクトの段階。**スマホのタブの組**を決める（PC は7タブのまま変えない） */
  phase: DetailPhase;
  /**
   * コストセンター（GMO）の案件か（`isCostCenterProject()`・2026年10月の事業再編・P3）。
   * **`billing` の表示ラベルだけを差し替える**——`key` は変えない（同上の理由）。
   */
  isCostCenter?: boolean;
}) {
  const navigate = useNavigate();
  const mobileKeys = effectiveMobileTabs(phase, counts.asks ?? 0, isCostCenter);
  const tabs = DETAIL_TABS.filter((t) => !mobile || mobileKeys.includes(t.key));

  /**
   * ステージ帯はレール（掴んで滑らせる・続きがある側だけ端が溶ける）。
   * 案件詳細⑥と同じ部品（`useRail`）。**マウント時に現在のステージを
   * 視野の中央へ寄せる** — 寄せないとスマホの初期表示で現在のステージが読めない。
   */
  const rail = useRail();
  const { ref: railRef } = rail;
  const bandRef = useRef<HTMLDivElement | null>(null);
  const setBandRef = useCallback((el: HTMLDivElement | null) => {
    bandRef.current = el;
    railRef(el);
  }, [railRef]);
  useEffect(() => {
    bandRef.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, []);

  return (
    <div className="border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-3.5 lg:px-6">
        <Link
          to="/gpm/projects"
          aria-label="プロジェクト一覧に戻る"
          className="rounded-control-lg flex h-11 w-11 shrink-0 items-center justify-center border border-border hover:bg-muted lg:h-10 lg:w-10"
        >
          <ArrowLeft className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* **スマホでは名前を折り返す。** 似た名前のプロジェクトを truncate で見分けられない */}
            <h1
              className={mobile ? 'text-h1 min-w-0 [overflow-wrap:anywhere]' : 'text-h1 min-w-0 truncate'}
              title={project.name}
            >
              {project.name}
            </h1>
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label="プロジェクトの内容を編集"
                title="プロジェクトの内容を編集"
                className="rounded-control-md flex h-11 w-11 shrink-0 items-center justify-center hover:bg-muted lg:h-9 lg:w-9"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="text-sub mt-0.5 truncate text-muted-foreground">{projectSub(project)}</p>
        </div>

        {/*
          **右上はこの画面でいちばんやること。** 期間・進み具合の数値表示は
          本文先頭の事実の帯へ移した（`GpmProjectDetailPage` 参照）。
          **スマホでは出さない**（案件詳細⑥と同じ考え方 — 概要タブの中に
          同じ「タスクを追加」がある）。
        */}
        {!mobile && canEdit && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button onClick={() => navigate(`/gpm/projects/${project.id}/overview?add=task`)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />タスクを追加
            </Button>
          </div>
        )}
      </div>

      {/*
        ── ステージ帯（PC 42px・スマホ 52px）───────────────────────
        進める4段（C〜R）は**各104px の等幅**。完了・失注は別組で60px。
        スマホでも横スクロールではなくレールにする（畳んでシートにすると
        ステージを変えるのに2タップ増える）。
      */}
      <div
        ref={setBandRef}
        onScroll={rail.onScroll}
        style={rail.style}
        className="v4-rail flex min-h-[52px] items-center gap-2 overflow-x-auto px-4 lg:min-h-0 lg:h-[42px] lg:px-6"
      >
        {canEdit ? (
          <>
            <div className="inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="ステージを変える">
              {STAGE_STEPS.map((s, i) => {
                const on = s === project.stage;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { if (!on) onChangeStage(s); }}
                    aria-pressed={on}
                    className={cn(
                      'text-sub inline-flex h-11 lg:h-8',
                      STAGE_W,
                      'shrink-0 items-center justify-center gap-1.5',
                      i > 0 && 'border-l border-border',
                      on ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <span className="font-number">{STAGE_SYMBOL[s]}</span>
                    {STAGE_BADGE_LABEL[s]}
                  </button>
                );
              })}
            </div>

            <div className="inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="プロジェクトを終える">
              {END_STEPS.map((s, i) => {
                const on = s === project.stage;
                const lost = s === 'e_lost';
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { if (!on) onChangeStage(s); }}
                    aria-pressed={on}
                    title={STAGE_BADGE_LABEL[s]}
                    className={cn(
                      'text-sub inline-flex h-11 lg:h-8',
                      END_W,
                      'shrink-0 items-center justify-center',
                      i > 0 && 'border-l border-border',
                      on
                        ? (lost ? 'bg-destructive font-bold text-destructive-foreground' : 'bg-secondary font-bold text-secondary-foreground')
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {END_SHORT[s]}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <span className="text-sub shrink-0 rounded-control border border-border px-3 py-1.5 text-muted-foreground">
            {STAGE_BADGE_LABEL[project.stage]}
          </span>
        )}

        <span className="flex-1" />
        {!mobile && (
          <span className="text-note font-number shrink-0 text-muted-foreground">
            最後の更新 {String(project.updated_at).slice(0, 10)}
          </span>
        )}
      </div>

      {/*
        ── タブ（44px）: **均等割り**（`flex-1`）。PC も横スクロールにしない
        （項目8）。以前は PC が横スクロール・スマホだけ均等割りで逆だった。
      */}
      <div className="flex h-11 px-4 lg:px-6">
        {tabs.map((t) => {
          const on = t.key === tab;
          const n = counts[t.key];
          return (
            <Link
              key={t.key}
              to={`/gpm/projects/${project.id}/${t.key}`}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'text-list -mb-px inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-1',
                on ? 'border-primary text-primary' : 'border-transparent font-normal text-muted-foreground hover:text-foreground',
              )}
            >
              <t.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {/* コストセンター（GMO）の案件だけ「請求」→「予算と実績」に出し分ける
                  （`key` は変えない。`tabs.ts` の `DETAIL_TABS` のコメント参照） */}
              <span className="truncate">{t.key === 'billing' && isCostCenter ? '予算と実績' : t.label}</span>
              {n !== undefined && n > 0 && (
                <span className="text-badge font-number inline-flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-chip bg-muted px-1.5 text-muted-foreground">
                  {n}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
