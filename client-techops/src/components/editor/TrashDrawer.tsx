// Qシート: ゴミ箱ドロワー
// doc.data.trash の内容を一覧表示し、復元・完全削除を行う。
import { X, RotateCcw, Trash2, AlertCircle } from "lucide-react";
import {
  TrashItem,
  getTrash,
  removeFromTrash,
  clearTrash,
  formatDeletedAt,
  describeTrashItem,
} from "@/lib/trash";
import { genId } from "@/lib/stableIds";

interface TrashDrawerProps {
  data: any; // doc.data
  onChange: (updater: (data: any) => any) => void;
  onClose: () => void;
}

export default function TrashDrawer({ data, onChange, onClose }: TrashDrawerProps) {
  const trash = getTrash(data);

  const handleRestore = (item: TrashItem) => {
    onChange((d) => {
      // セクション、行、エントリそれぞれを元の位置（または末尾）に戻す
      const next = removeFromTrash(d, item.id);
      const sections = [...(next.sections || [])];

      if (item.type === "section") {
        const insertAt = typeof item.origin.sectionIdx === "number"
          ? Math.min(item.origin.sectionIdx, sections.length)
          : sections.length;
        sections.splice(insertAt, 0, item.payload);
        return { ...next, sections };
      }

      if (item.type === "row") {
        const si = typeof item.origin.sectionIdx === "number" ? item.origin.sectionIdx : -1;
        if (si >= 0 && si < sections.length) {
          const sec = { ...sections[si] };
          const rows = [...(sec.rows || [])];
          const insertAt = typeof item.origin.rowIdx === "number"
            ? Math.min(item.origin.rowIdx, rows.length)
            : rows.length;
          rows.splice(insertAt, 0, item.payload);
          sec.rows = rows;
          sections[si] = sec;
          return { ...next, sections };
        }
        // 元セクションが見つからない場合は末尾のセクションに追加（それも無ければ新セクション）
        alert("元のロールが見つからないため、末尾に新しいロールを作って復元します。");
        sections.push({ id: genId("sec"), label: "復元された行", rows: [item.payload] });
        return { ...next, sections };
      }

      if (item.type === "entry") {
        const si = typeof item.origin.sectionIdx === "number" ? item.origin.sectionIdx : -1;
        const ri = typeof item.origin.rowIdx === "number" ? item.origin.rowIdx : -1;
        const blockId = item.origin.blockId;
        if (si >= 0 && ri >= 0 && blockId && si < sections.length) {
          const sec = { ...sections[si] };
          const rows = [...(sec.rows || [])];
          if (ri < rows.length) {
            const row = { ...rows[ri] };
            const cells = { ...(row.cells || {}) };
            const cell = { ...(cells[blockId] || {}) };
            const entries = [...(cell.entries || [])];
            const insertAt = typeof item.origin.entryIdx === "number"
              ? Math.min(item.origin.entryIdx, entries.length)
              : entries.length;
            entries.splice(insertAt, 0, item.payload);
            cell.entries = entries;
            cells[blockId] = cell;
            row.cells = cells;
            rows[ri] = row;
            sec.rows = rows;
            sections[si] = sec;
            return { ...next, sections };
          }
        }
        alert("元の行/列が見つからないため、復元できませんでした。");
        return d; // 復元せずゴミ箱にも残す
      }

      return next;
    });
  };

  const handlePermanentDelete = (item: TrashItem) => {
    if (!confirm("このアイテムを完全に削除します。よろしいですか？")) return;
    onChange((d) => removeFromTrash(d, item.id));
  };

  const handleClearAll = () => {
    if (!confirm(`ゴミ箱の全 ${trash.length} 件を完全に削除します。よろしいですか？`)) return;
    onChange((d) => clearTrash(d));
  };

  return (
    <div className="fixed inset-0 z-[1500] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-md h-full bg-white dark:bg-zinc-900 shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex-none flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Trash2 size={18} className="text-zinc-500" />
            <h2 className="text-base font-semibold">ゴミ箱</h2>
            <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
              {trash.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {trash.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 hover:text-red-700 transition-colors"
                title="ゴミ箱を空にする"
              >
                すべて完全削除
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors"
              title="閉じる (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          {trash.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-3 p-8">
              <Trash2 size={40} className="opacity-30" />
              <p className="text-sm">ゴミ箱は空です</p>
              <p className="text-xs text-zinc-400 text-center">
                ロール・行を削除するとここに退避されます
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {trash.slice().reverse().map((item) => (
                <li key={item.id} className="px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          item.type === 'section' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                          item.type === 'row'     ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' :
                          'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}>
                          {item.type === 'section' ? 'ロール' : item.type === 'row' ? '行' : '行内項目'}
                        </span>
                        <span className="text-[11px] text-zinc-400">{formatDeletedAt(item.deletedAt)}</span>
                      </div>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                        {describeTrashItem(item)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleRestore(item)}
                        className="p-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-950/40 text-emerald-600 hover:text-emerald-700 transition-colors"
                        title="復元"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(item)}
                        className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/40 text-red-500 hover:text-red-700 transition-colors"
                        title="完全削除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex-none px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <p className="text-[11px] text-zinc-500 flex items-start gap-1.5">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            ゴミ箱の内容はQシートと一緒に保存されます。保存前にブラウザを閉じると失われます。
          </p>
        </footer>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
