/**
 * ⑧ 会社と切替（設定・v4）— 2026年10月の事業再編（社名変更・計上会社の2社化・
 * 案件番号の改番）の下準備をする画面。詳しい設計は `docs/reorg-2026-10-plan.md`。
 *
 * ── この画面が作る範囲（P0）───────────────────────────────────
 * 会社マスター（`legal_entities`）の発行者情報の編集と、切替状態
 * （`org_transition`）の表示・前進だけ。**改番の対象一覧（移行センター）は
 * 別の PR（P1）の仕事**。ここで状態を進めても、案件番号の採番方式など
 * 他の画面の振る舞いは P1 が入るまで変わらない（記録が変わるだけ）。
 *
 * ── 権限 ────────────────────────────────────────────────────
 * 直せるのは `system_admin` だけ（発行者情報・切替状態とも）。それ以外は
 * 全項目を disabled で見せる（`MoneyRulesPage`/`HoursPage` と同じ Lock アイコンの
 * 帯を1本だけ出す — セクションごとに繰り返さない）。
 */
import { useQuery } from '@tanstack/react-query';
import { Building2, Lock } from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { useAuth } from '@/contexts/platform/AuthContext';
import { EntityCard } from './EntityCard';
import { TransitionPanel } from './TransitionPanel';
import type { LegalEntity, OrgTransition } from './types';

export default function ReorgPage() {
  const { currentUser } = useAuth();
  const canEdit = currentUser?.role === 'system_admin';

  const entitiesQ = useQuery<LegalEntity[]>({
    queryKey: ['legal-entities'],
    queryFn: async () => (await api.get('/legal-entities')).data.data,
  });

  // 切替状態は別クエリ。**こちらが失敗しても会社マスターは表示できる**
  // （MoneyRulesPage の `stageQ` と同じ考え方）
  const transitionQ = useQuery<OrgTransition>({
    queryKey: ['org-transition'],
    queryFn: async () => (await api.get('/org-transition')).data.data,
  });

  if (entitiesQ.isError) {
    return (
      <ErrorPanel
        title="計上会社を読み込めませんでした"
        error={entitiesQ.error}
        onRetry={() => entitiesQ.refetch()}
      />
    );
  }
  if (!entitiesQ.data) return <Delayed><SkeletonRows rows={8} /></Delayed>;

  return (
    <div className="flex flex-col gap-3.5 p-3 lg:gap-4 lg:p-6">
      <PageHeader
        title="会社と切替"
        sub="10月の事業再編（社名変更・計上会社の2社化・案件番号の改番）の下準備をする画面です。詳しい設計は docs/reorg-2026-10-plan.md にあります。"
      />

      {!canEdit && (
        <p className="rounded-note text-note flex items-center gap-2 border border-border bg-surface-subtle px-3.5 py-2.5 text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          直せるのは<strong className="font-bold">システム管理者</strong>だけです。中身は見られます。
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-note inline-flex h-7 w-7 shrink-0 items-center justify-center bg-primary-surface">
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
          <span className="text-cardtitle shrink-0">計上会社</span>
          <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">
            売上・費用をどの会社の帳簿に載せるか
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
          {entitiesQ.data.map((e) => <EntityCard key={e.code} entity={e} canEdit={canEdit} />)}
        </div>
      </div>

      {transitionQ.isError ? (
        <p className="rounded-card text-note border border-border bg-card px-4 py-3 text-muted-foreground">
          切替状態を読み込めませんでした。
        </p>
      ) : transitionQ.data ? (
        <TransitionPanel transition={transitionQ.data} canEdit={canEdit} />
      ) : (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      )}
    </div>
  );
}
