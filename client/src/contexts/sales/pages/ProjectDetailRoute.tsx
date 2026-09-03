/**
 * 「案件詳細」のルート入口。
 *
 * **案件が変わったらページごと作り直す**（`key`）。`ProjectFormRoute.tsx`
 * （「案件を直す」）と同じ形 — いまはこのアプリの中に、案件詳細から
 * 別の案件の案件詳細へ直接飛ぶリンクは無いので今日は踏めないが、
 * `key` を持たないままだと React Router は id が変わっただけでは要素を
 * 作り直さない（`useParams` の `id` だけが変わる）ため、`['project', id]` を
 * 含む各タブの `useQuery` は `refetchOnMount` ではなく `setOptions` 経路を通り、
 * マウント時の強制フェッチが効かない。DetailHeader.tsx のステージ帯を
 * 視野中央へ寄せる effect も「マウント時だけ」を前提にしている。
 * 将来「関連案件」「次の案件」のようなリンクを足したときに同じ穴を
 * 踏まないよう、`ProjectFormPage` と対称に直しておく。
 */
import { useParams } from 'react-router-dom';
import ProjectDetailPage from './ProjectDetailPage';

export default function ProjectDetailRoute() {
  const { id } = useParams();
  return <ProjectDetailPage key={id} />;
}
