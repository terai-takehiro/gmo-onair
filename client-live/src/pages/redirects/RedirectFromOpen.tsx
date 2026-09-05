import { useSearchParams } from 'react-router-dom';
import type { RedirectTarget } from './RedirectStatus';
import { RedirectView } from './RedirectStatus';

/**
 * 旧URL `/live/open?project=:id`（フェーズ1の橋渡し。`OpenByProjectPage.tsx` の後継）
 * → 新URL `/techops/live/:project`。
 *
 * フェーズ1では「取得または作成」（`resolve-by-project`）をこの画面自身が呼んでいたが、
 * 新ダッシュボード（`client-techops` 側 `LiveDashboardPage.tsx`）がマウント時に同じ役割を
 * 行うようになった（`useLiveProgram.ts`）ので、ここではクエリの `project` をそのまま
 * 新URLへ渡すだけでよい（GROUND_RULES §2 の表）。
 */
export default function RedirectFromOpen() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');

  const target: RedirectTarget = projectId
    ? { status: 'redirect', to: `/techops/live/${encodeURIComponent(projectId)}` }
    : { status: 'error', message: '案件から開き直してください。制作技術支援のトップで案件を開き、計時・視聴者のタイルから入れます。' };

  return <RedirectView target={target} />;
}
