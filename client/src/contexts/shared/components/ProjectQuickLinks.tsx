import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Briefcase, Wallet, Truck, Calendar, KanbanSquare, Package } from "lucide-react";
import { openAppPath } from "@/lib/openAppPath";

export type ProjectLinkPage = "project" | "revenues" | "purchases" | "calendar" | "tasks" | "equipment";

interface ProjectQuickLinksProps {
  projectId: string;
  projectName?: string;
  currentPage: ProjectLinkPage;
  /** 縦並び or 横並び（default 横並び）*/
  vertical?: boolean;
  className?: string;
}


/**
 * 同じ案件における「案件詳細・売上・仕入・カレンダー・タスク・機材」間の直接リンク群。
 * 現在いるページは disabled（自分自身へのリンクはアクティブスタイル）。
 *
 * **行き先は刷新後の正のURLを直接指す。** 旧URL (`/budget/revenues`) を経由すると
 * App.tsx の `<Navigate to="/finance?tab=revenue">` が**クエリを捨てる**ため、
 * 案件で絞り込んだつもりが全案件の売上一覧に着いていた (docs/ia.md Phase 7
 * 「内部の呼び出し元は正のURLを直接指す」の徹底漏れ)。
 */
export default function ProjectQuickLinks({
  projectId,
  projectName,
  currentPage,
  vertical = false,
  className = "",
}: ProjectQuickLinksProps) {
  const navigate = useNavigate();
  if (!projectId) return null;

  const nameParam = projectName ? `&project_name=${encodeURIComponent(projectName)}` : "";

  const links: Array<{
    key: ProjectLinkPage;
    label: string;
    icon: React.ReactNode;
    to: string;
  }> = [
    { key: "project", label: "案件", icon: <Briefcase className="h-3.5 w-3.5" />, to: `/sales/projects/${projectId}` },
    { key: "revenues", label: "売上", icon: <Wallet className="h-3.5 w-3.5" />, to: `/finance?tab=revenue&project_id=${projectId}${nameParam}` },
    { key: "purchases", label: "仕入", icon: <Truck className="h-3.5 w-3.5" />, to: `/finance?tab=purchase&project_id=${projectId}${nameParam}` },
    { key: "calendar", label: "カレンダー", icon: <Calendar className="h-3.5 w-3.5" />, to: `/schedule?layers=studio&project_id=${projectId}${nameParam}` },
    { key: "tasks", label: "タスク", icon: <KanbanSquare className="h-3.5 w-3.5" />, to: `/tasks?scope=project&project=${projectId}` },
    // 貸出は案件から始められる (§4.16)。案件を持ったまま機材の貸出画面へ
    { key: "equipment", label: "機材", icon: <Package className="h-3.5 w-3.5" />, to: `/equipment/lendings?project_id=${projectId}${nameParam}` },
  ];

  return (
    <div
      className={`${vertical ? "flex-col" : "flex-wrap"} inline-flex gap-1.5 ${className}`}
      role="group"
      aria-label="案件内の関連ページ"
    >
      {links.map((l) => {
        const isCurrent = l.key === currentPage;
        return (
          <Button
            key={l.key}
            type="button"
            size="sm"
            variant={isCurrent ? "default" : "outline"}
            disabled={isCurrent}
            // 機材は別バンドルなので navigate() では届かない (openAppPath が判定する)
            onClick={() => openAppPath(l.to, navigate)}
            className="h-8 gap-1.5"
          >
            {l.icon}
            <span className="text-xs">{l.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
