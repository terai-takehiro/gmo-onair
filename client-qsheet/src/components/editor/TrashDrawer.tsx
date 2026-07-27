/**
 * Qシート: ゴミ箱と直前の変更 (§4.12)
 *
 * 2つを1枚に並べている。役割が違うため。
 *   - **ゴミ箱** … 消したロール・行を「元の場所に戻す」。Qシートと一緒に保存されるので後日でも戻せるが、
 *     **保存される前に閉じると消える** (保存されていない削除は復元手段がなくなる)。
 *   - **直前の変更** … 保存とは無関係にメモリで持っている履歴。開いている間だけだが、
 *     消した直後・保存前でも確実に戻せる。ゴミ箱の穴を埋めるのがこちら。
 */
import { X, RotateCcw, Trash2, AlertCircle, Undo2, History } from "lucide-react";
import {
  TrashItem,
  getTrash,
  removeFromTrash,
  clearTrash,
  formatDeletedAt,
  describeTrashItem,
} from "@/lib/trash";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { notifyError } from '@/lib/notify';

interface TrashDrawerProps {
  data: any; // doc.data
  onChange: (updater: (data: any) => any) => void;
  onClose: () => void;
  /** 直前の変更 (古い順)。保存に依存しないメモリ上の履歴 */
  history?: { label: string; at: number }[];
  /** index を渡すとそこまで戻す */
  onUndo?: (index?: number) => void;
}

function elapsed(at: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  return `${Math.floor(min / 60)}時間前`;
}

export default function TrashDrawer({ data, onChange, onClose, history = [], onUndo }: TrashDrawerProps) {
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
        notifyError("元のロールが見つからないため、末尾に新しいロールを作って復元します。");
        sections.push({ id: `restored-${Date.now()}`, label: "復元された行", rows: [item.payload] });
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
        notifyError("元の行/列が見つからないため、復元できませんでした。");
        return d; // 復元せずゴミ箱にも残す
      }

      return next;
    });
  };

  const handlePermanentDelete = async (item: TrashItem) => {
    if (!(await confirmAction({ title: "このアイテムを完全に削除します。よろしいですか？", confirmLabel: '削除する', tone: 'danger' }))) return;
    onChange((d) => removeFromTrash(d, item.id));
  };

  const handleClearAll = async () => {
    if (!(await confirmAction({ title: `ゴミ箱の全 ${trash.length} 件を完全に削除します。よろしいですか？`, confirmLabel: '削除する', tone: 'danger' }))) return;
    onChange((d) => clearTrash(d));
  };

  return (
    <div className="fixed inset-0 z-[1500] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-md h-full bg-white dark:bg-background shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex-none flex items-center justify-between px-5 py-3 border-b border-border dark:border-border">
          <div className="flex items-center gap-2">
            <Trash2 size={18} className="text-muted-foreground" />
            <h2 className="text-base font-semibold">ゴミ箱と直前の変更</h2>
            <span className="px-2 py-0.5 rounded-full bg-muted dark:bg-card text-xs text-muted-foreground dark:text-muted-foreground">
              {trash.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {trash.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs px-2 py-1 rounded hover:bg-destructive-surface dark:hover:bg-destructive/30 text-destructive hover:text-destructive transition-colors"
                title="ゴミ箱を空にする"
              >
                すべて完全削除
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted dark:hover:bg-card text-muted-foreground transition-colors"
              title="閉じる (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          {/* 直前の変更 — 保存前でも戻せるのはこちら */}
          <section className="border-b border-border dark:border-border">
            <div className="flex items-center justify-between px-5 pt-3 pb-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <History size={12} />
                直前の変更
              </h3>
              {history.length > 0 && onUndo && (
                <button
                  onClick={() => onUndo()}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted dark:text-foreground dark:hover:bg-card"
                  title="1つ戻す (Ctrl+Z)"
                >
                  <Undo2 size={12} />
                  1つ戻す
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="px-5 pb-3 text-[11px] leading-relaxed text-muted-foreground">
                この画面を開いてからの変更がここに並びます。保存する前でも戻せます（画面を閉じると履歴は消えます）。
              </p>
            ) : (
              <ul className="pb-2">
                {history.slice().reverse().slice(0, 12).map((h, revIdx) => {
                  const idx = history.length - 1 - revIdx;
                  return (
                    <li key={`${h.at}-${idx}`}>
                      <button
                        onClick={() => onUndo?.(idx)}
                        className="flex w-full items-center gap-2 px-5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted dark:text-muted-foreground dark:hover:bg-card/50"
                        title="ここまで戻す"
                      >
                        <Undo2 size={12} className="flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{h.label}</span>
                        <span className="flex-shrink-0 text-[10px] text-muted-foreground">{elapsed(h.at)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {trash.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-muted-foreground gap-3 p-8">
              <Trash2 size={40} className="opacity-30" />
              <p className="text-sm">ゴミ箱は空です</p>
              <p className="text-xs text-muted-foreground text-center">
                ロール・行を削除するとここに退避されます
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border dark:divide-border">
              {trash.slice().reverse().map((item) => (
                <li key={item.id} className="px-5 py-3 hover:bg-muted dark:hover:bg-card/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          item.type === 'section' ? 'bg-accent text-primary dark:bg-primary dark:text-primary' :
                          item.type === 'row'     ? 'bg-cat-7/10 text-cat-7 dark:bg-cat-7 dark:text-cat-7' :
                          'bg-success-surface text-success dark:bg-success dark:text-success'
                        }`}>
                          {item.type === 'section' ? 'ロール' : item.type === 'row' ? '行' : '行内項目'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{formatDeletedAt(item.deletedAt)}</span>
                      </div>
                      <p className="text-sm font-medium text-muted-foreground dark:text-foreground truncate">
                        {describeTrashItem(item)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleRestore(item)}
                        className="p-1.5 rounded-lg hover:bg-success-surface dark:hover:bg-success/40 text-success hover:text-success transition-colors"
                        title="復元"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(item)}
                        className="p-1.5 rounded-lg hover:bg-destructive-surface dark:hover:bg-destructive/40 text-destructive hover:text-destructive transition-colors"
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

        <footer className="flex-none px-5 py-3 border-t border-border dark:border-border bg-muted dark:bg-background/50">
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
ゴミ箱はQシートと一緒に保存されるので後日でも戻せますが、保存する前に閉じると消えます。保存前の取り消しは上の「直前の変更」を使ってください。
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
