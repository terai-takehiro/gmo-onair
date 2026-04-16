import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Trash2, Plus, FileText, Scissors } from "lucide-react";

interface Props {
  onDelete: () => void;
  onAddBreakAfter: () => void;
  onAddPageBreakAfter: () => void;
  onSaveTemplate?: () => void;
}

export default function SectionMenu({ onDelete, onAddBreakAfter, onAddPageBreakAfter, onSaveTemplate }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-1 rounded hover:bg-white/15 text-white/40 hover:text-white transition-colors"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 py-1 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 z-50 animate-scale-in">
          <button
            onClick={() => { onAddBreakAfter(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-zinc-50 dark:hover:bg-zinc-700 text-left transition-colors"
          >
            <Plus size={12} className="text-amber-500" />
            <span>CM・休憩を追加</span>
          </button>
          <button
            onClick={() => { onAddPageBreakAfter(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-zinc-50 dark:hover:bg-zinc-700 text-left transition-colors"
          >
            <Scissors size={12} className="text-zinc-400" />
            <span>改ページを追加</span>
          </button>
          {onSaveTemplate && (
            <button
              onClick={() => { onSaveTemplate(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-zinc-50 dark:hover:bg-zinc-700 text-left transition-colors"
            >
              <FileText size={12} className="text-blue-500" />
              <span>テンプレとして保存</span>
            </button>
          )}
          <div className="border-t border-zinc-100 dark:border-zinc-700 my-1" />
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 text-left transition-colors"
          >
            <Trash2 size={12} />
            <span>このロールを削除</span>
          </button>
        </div>
      )}
    </div>
  );
}
