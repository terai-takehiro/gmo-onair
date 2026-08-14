import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Briefcase, Wallet, Truck, Calendar, KanbanSquare } from "lucide-react";

export type ProjectLinkPage = "project" | "revenues" | "purchases" | "calendar" | "tasks";

interface ProjectQuickLinksProps {
  projectId: string;
  projectName?: string;
  currentPage: ProjectLinkPage;
  /** 縦並び or 横並び（default 横並び）*/
  vertical?: boolean;
  className?: string;
}

/**
 * 同じ案件における「案件詳細・売上管理・仕入管理・カレンダー」間の直接リンク群。
 * 現在いるページは disabled（自分自身へのリンクはアクティブスタイル）。
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
    { key: "project",   label: "案件",    icon: <Briefcase className="h-3.5 w-3.5" />, to: `/sales/projects/${projectId}` },
    { key: "revenues",  label: "売上",    icon: <Wallet    className="h-3.5 w-3.5" />, to: `/budget/revenues?project_id=${projectId}${nameParam}` },
    { key: "purchases", label: "仕入",    icon: <Truck     className="h-3.5 w-3.5" />, to: `/budget/purchases?project_id=${projectId}${nameParam}` },
    /*
      ⚠️ **カレンダーには `?project_id=` を付けません。** v4 の ① 予定
      （`UnifiedCalendarPage`）は案件で絞る機能を持っておらず、付けても
      **誰も読まないまま全件のカレンダーが出ます**（案件で絞られたと
      読まれるぶん、無いほうがまし）。旧カレンダーの頃の書き方の残りです。
      案件の日と部屋を持って開きたいときは、案件を直す画面の
      「カレンダーで空きを見る」を使ってください（`state` で渡します）。
    */
    { key: "calendar",  label: "カレンダー", icon: <Calendar      className="h-3.5 w-3.5" />, to: '/studio/calendar' },
    { key: "tasks",     label: "タスク",     icon: <KanbanSquare className="h-3.5 w-3.5" />, to: `/sales/projects/${projectId}/task` },
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
            onClick={() => navigate(l.to)}
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
