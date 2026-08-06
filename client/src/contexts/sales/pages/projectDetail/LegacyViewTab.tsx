/**
 * 案件詳細 / 回・見積-請求タブ (v4 ⑥-C)
 *
 * ── 中身は作り直していません ────────────────────────────────
 *
 * どちらも `BusinessProjectView` (2,042行) を呼ぶだけです。
 * 旧 `EpisodeListPage` と `EstimatePage` は**同じものを別 URL で開いていた
 * 32行のラッパー**で、違いは `isEstimateMode` の有無だけでした。
 * ここに畳んだので、その2ファイルは消しました。
 *
 * **見積の「版」(v1 送付済 / v2 作成中) は作っていません。**
 * `revenues` には見積という状態も版も無く (status は `confirmed` だけ)、
 * 出すには DB の設計判断が要ります。枠が全部そろってから単独で扱います
 * — 枠を入れ替える回とデータの形を変える回を混ぜると、
 * どちらが原因で壊れたか切り分けられなくなるためです。
 */
import BusinessProjectView from '@/contexts/production/components/episodes/BusinessProjectView';
import type { Project } from '@/types';
import type { ProjectDetail } from './types';

export function LegacyViewTab({
  project, estimateMode,
}: { project: ProjectDetail; estimateMode?: boolean }) {
  // `GET /projects/:id` は行をそのまま返すので、`Project` の項目はすべて入っている。
  // `ProjectDetail` はこの画面が使う分だけを書いた**部分集合**なので、ここで戻す
  const full = project as unknown as Project;
  return (
    <div className="min-h-0 flex-1">
      <BusinessProjectView project={full} projectId={project.id} isEstimateMode={estimateMode} />
    </div>
  );
}
