/**
 * 「案件を直す / 案件をつくる」のルート入口。
 *
 * **案件が変わったらフォームごと作り直す**（`key`）。
 * `/sales/projects/A/edit` → `/sales/projects/B/edit` と SPA 内で移ると React Router は
 * 同じ要素を使い回すので、A で触った欄（dirty）が `keepDirtyValues` の reset で
 * **B の値に差し替わらず残る**。GPM の「プロジェクトを直す」で直したのと同じ形（v4.5.17）。
 * `ProjectFormPage.tsx` は行数の上限を超えているので、ここに分けて置く。
 */
import { useParams } from 'react-router-dom';
import ProjectFormPage from './ProjectFormPage';

export default function ProjectFormRoute() {
  const { id } = useParams();
  return <ProjectFormPage key={id ?? 'new'} />;
}
