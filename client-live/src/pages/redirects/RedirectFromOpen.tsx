import { useSearchParams } from 'react-router-dom';
import type { RedirectTarget } from './RedirectStatus';
import { RedirectView } from './RedirectStatus';

/**
 * 旧URL `/live/open?project=:id`（フェーズ1の橋渡し。`OpenByProjectPage.tsx` の後継）
 * → 新URL `/qsheet/live/:project`。
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
    ? { status: 'redirect', to: `/qsheet/live/${encodeURIComponent(projectId)}` }
    : { status: 'error', message: '案件が指定されていません（URL に ?project= が必要です）。' };

  return <RedirectView target={target} />;
}
