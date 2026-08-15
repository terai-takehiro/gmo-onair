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
import {
  Delayed, SkeletonRows, ErrorPanel, NoPermissionPanel,
} from '@gmo-onair/shared/src/client/states';
import BusinessProjectView from '@/contexts/production/components/episodes/BusinessProjectView';
import { useAuth } from '@/contexts/platform/AuthContext';
import type { Project } from '@/types';

export function BillingTab({ projectId }: { projectId: string }) {
  /*
   * ⚠️ **この画面は案件管理と財務管理の権限で動いています**（レビューでの指摘 #67）。
   * 読むもの（案件の行・売上・仕入・仕入先・回）はどれも `sales` / `budget` の口で、
   * `gpm` だけの人が開くと**開いた瞬間に 403** でした（真っ白＋理由なし）。
   * **押せるのに 403 を作らない**という v4 の決めごとに合わせ、
   * **何の権限が要るかを名前で出して止めます**（白紙にしない）。
   */
  const { hasPermission } = useAuth();
  const canRead = hasPermission('sales') && hasPermission('budget');

  const { data, isLoading, isError, refetch } = useQuery<Project>({
    queryKey: ['gpm-project-full', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data.data,
    enabled: !!projectId && canRead,
  });

  if (!canRead) {
    return (
      <div className="p-4 lg:p-6">
        {/*
          * **`requireAll`** — この画面は案件の行（`sales`）と売上・仕入（`budget`）の
          * **両方**を読みます。既定の「いずれか」のままだと、片方だけ足してもらって
          * また同じ所で止まります。
          */}
        <NoPermissionPanel
          modules={['sales', 'budget']}
          requireAll
          target="このプロジェクトの請求（月次）"
        />
      </div>
    );
  }

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
      {/*
        * ⚠️ **`isEstimateMode` を渡さない**（レビューでの指摘 #67）。
        * 渡すと `monthlyMode` が必ず false になり、**このタブの目的である
        * 月次請求・月締めが1つも出ません**（見積の画面になります）。
        * プロジェクトの見積は**別のタブ**（`estimates` の表）が持っています。
        * ⚠️ 月次に切り替わるには **GLS 番号も要ります** — 受注のときに
        * 採るようにしました（`gpm.service` の `update`）。
        */}
      <BusinessProjectView project={data} projectId={projectId} />
    </div>
  );
}
