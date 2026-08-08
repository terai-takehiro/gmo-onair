/**
 * プロジェクト詳細 / 請求タブ（月次請求・月締め）
 *
 * ── 案件管理から持ってきたもの ──────────────────────────────
 *
 * migration 179 でプロジェクトが GLS-B の案件になったので、
 * **案件詳細にあった「月次請求（月締め）」がここに来ます**。
 * 中身は `BusinessProjectView`（2,042行）を**1行も変えずに**呼ぶだけです —
 * 枠を移す回と中身を作り直す回を混ぜると、どちらが原因で壊れたか切り分けられません。
 *
 * ── なぜ全部の行をもう一度読むのか ──────────────────────────
 *
 * `GET /gpm/projects/:id` は画面が使う列だけを返します（工程・体制・未確認事項を
 * 一緒に積むので、案件の 48 列を全部載せると重い）。`BusinessProjectView` は
 * `Project` そのものを要求するので、このタブを開いたときだけ `GET /projects/:id`
 * を引きます。**開くまで引かない**のが要点です。
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import BusinessProjectView from '@/contexts/production/components/episodes/BusinessProjectView';
import type { Project } from '@/types';

export function BillingTab({ projectId }: { projectId: string }) {
  const { data, isLoading, isError, refetch } = useQuery<Project>({
    queryKey: ['gpm-project-full', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data.data,
    enabled: !!projectId,
  });

  if (isError) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorPanel title="請求を読み込めませんでした" onRetry={() => refetch()} />
      </div>
    );
  }
  if (isLoading || !data) {
    return <div className="p-4 lg:p-6"><Delayed><SkeletonRows rows={5} /></Delayed></div>;
  }

  return (
    <div className="min-h-0 flex-1">
      <BusinessProjectView project={data} projectId={projectId} isEstimateMode />
    </div>
  );
}
