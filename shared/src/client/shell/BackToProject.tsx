// shared/src/client/shell/BackToProject.tsx — 案件へ戻る道 (v3.0.9)
//
// ── なぜ必要だったか ───────────────────────────────────────
//
// `docs/ia.md` は現場ツールの到達経路を「①案件から開く (既定)」と決めている。
// ところが**現場アプリ5本の中に `/projects` や `/sales/projects` を指す箇所が
// 1つも無かった** (実測: `client-equipment` / `client-qsheet` / `client-techsheet`
// / `client-awards` / `client-live` の src 全体で0件)。
//
// つまり 案件 → Qシート と進んだら、**戻るのはブラウザの戻るボタンだけ**。
// 別のタブで開いた場合は戻り道が無く、レールの「案件」を押して一覧から
// 探し直すことになる。案件をハブにする設計なのに、行きだけの一方通行だった。
//
// ── 決めたこと ─────────────────────────────────────────────
//
//  - **URL に案件が入っているときだけ出す。** 単発で開いたときに出すと、
//    関係の無い案件に飛ばすことになる (`?project=` / `?project_id=`)
//  - **案件名は取りに行かない。** 名前の取得に失敗したときに戻り道が消えるのは
//    本末転倒なので、「案件にもどる」だけで出す。名前が渡っていれば添える
//  - 別バンドルなので**読み込み直して開く**

import { ArrowLeft } from 'lucide-react';

/** URL から案件の id と名前を読む。`?project=` と `?project_id=` の両方を見る */
export function projectFromSearch(search: string): { id: string; name?: string } | null {
  const p = new URLSearchParams(search);
  const id = p.get('project') || p.get('project_id');
  if (!id) return null;
  return { id, name: p.get('project_name') || undefined };
}

export default function BackToProject({ search }: { search: string }) {
  const project = projectFromSearch(search);
  if (!project) return null;
  const href = `/sales/projects/${encodeURIComponent(project.id)}`;
  return (
    <a
      href={href}
      className="inline-flex min-h-tap shrink-0 items-center gap-1 rounded-control px-2 text-[13px] font-bold text-primary transition-colors hover:bg-accent"
      title="この道具を開いた案件にもどる"
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="max-w-col-5 truncate">{project.name ?? '案件にもどる'}</span>
    </a>
  );
}
