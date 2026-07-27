import { KanbanSquare, List, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TaskView = "kanban" | "list" | "gantt";

interface ViewToggleProps {
  current: TaskView;
  onChange: (v: TaskView) => void;
}

const VIEWS: { key: TaskView; label: string; icon: React.ReactNode }[] = [
  { key: "kanban", label: "カンバン", icon: <KanbanSquare className="h-3.5 w-3.5" /> },
  { key: "list", label: "リスト", icon: <List className="h-3.5 w-3.5" /> },
  { key: "gantt", label: "ガント", icon: <BarChart2 className="h-3.5 w-3.5" /> },
];

export default function ViewToggle({ current, onChange }: ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="表示形式"
      className="inline-flex rounded-md border border-border overflow-hidden"
    >
      {VIEWS.map((v) => (
        <Button
          key={v.key}
          type="button"
          size="sm"
          variant={current === v.key ? "default" : "ghost"}
          className="rounded-none h-8 gap-1.5 border-0 border-r border-border last:border-r-0"
          onClick={() => onChange(v.key)}
          aria-pressed={current === v.key}
        >
          {v.icon}
          <span className="text-xs hidden sm:inline">{v.label}</span>
        </Button>
      ))}
    </div>
  );
}
