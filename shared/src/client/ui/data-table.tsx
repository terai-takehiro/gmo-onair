/**
 * shared/src/client/ui/data-table.tsx — TanStack-Table 風のラッパー
 *
 * v2.4.0 で client/src/components/ui/data-table.tsx から shared に移管。
 * 全 6 アプリで `import { DataTable } from '@gmo-onair/shared/src/client/ui/data-table'`
 * で利用可能。Phase 2 で `useCrudPage` のテーブルとして共有される予定。
 *
 * 機能:
 *  - 列のドラッグリサイズ (storageKey で永続化)
 *  - クリックでのソート (3-state: asc → desc → none)
 *  - 行クリックハンドラ
 *  - 行末アクション列
 *  - 空状態メッセージ
 */
import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import { ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "../utils";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell?: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  defaultWidth?: number;
  minWidth?: number;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right" | "center";
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  storageKey?: string;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => ReactNode;
  actionsHeader?: ReactNode;
  actionsWidth?: number;
  emptyMessage?: string;
}

type SortDirection = "asc" | "desc" | null;

export function DataTable<T>({
  data,
  columns,
  rowKey,
  storageKey,
  onRowClick,
  actions,
  actionsHeader,
  actionsWidth = 96,
  emptyMessage = "データがありません",
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const col of columns) {
      if (col.defaultWidth) initial[col.key] = col.defaultWidth;
    }
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`dt-widths-${storageKey}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          return { ...initial, ...parsed };
        }
      } catch {
        // ignore
      }
    }
    return initial;
  });

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(`dt-widths-${storageKey}`, JSON.stringify(widths));
    } catch {
      // ignore
    }
  }, [widths, storageKey]);

  const handleSort = (col: DataTableColumn<T>) => {
    if (col.sortable === false) return;
    if (sortKey !== col.key) {
      setSortKey(col.key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortKey(null);
      setSortDir(null);
    } else {
      setSortDir("asc");
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return data;
    const getVal = (row: T) => {
      if (col.sortValue) return col.sortValue(row);
      const v = (row as Record<string, unknown>)[sortKey];
      if (v == null) return null;
      if (typeof v === "number" || typeof v === "string") return v;
      if (Array.isArray(v)) return v.join(", ");
      return String(v);
    };
    const sorted = [...data].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return av - bv;
      }
      return String(av).localeCompare(String(bv), "ja");
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [data, sortKey, sortDir, columns]);

  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      const col = columns.find((c) => c.key === r.key);
      const min = col?.minWidth ?? 60;
      const next = Math.max(min, r.startWidth + delta);
      setWidths((prev) => ({ ...prev, [r.key]: next }));
    };
    const onUp = () => {
      resizingRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [columns]);

  const startResize = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const current = widths[colKey] ?? columns.find((c) => c.key === colKey)?.defaultWidth ?? 160;
    resizingRef.current = {
      key: colKey,
      startX: e.clientX,
      startWidth: current,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const alignClass = (align?: "left" | "right" | "center") =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <div className="relative w-full overflow-auto rounded-md border">
      <table className="w-full caption-bottom text-sm" style={{ tableLayout: "fixed" }}>
        <colgroup>
          {columns.map((col) => (
            <col
              key={col.key}
              style={{ width: widths[col.key] ? `${widths[col.key]}px` : col.defaultWidth ? `${col.defaultWidth}px` : undefined }}
            />
          ))}
          {actions && <col style={{ width: `${actionsWidth}px` }} />}
        </colgroup>
        <thead className="[&_tr]:border-b">
          <tr className="border-b">
            {columns.map((col) => {
              const isSorted = sortKey === col.key;
              const sortable = col.sortable !== false;
              return (
                <th
                  key={col.key}
                  className={cn(
                    "relative h-10 px-4 align-middle font-medium text-muted-foreground select-none",
                    alignClass(col.align),
                    sortable && "cursor-pointer hover:bg-muted/50",
                    col.headerClassName
                  )}
                  onClick={sortable ? () => handleSort(col) : undefined}
                >
                  <div
                    className={cn(
                      "flex items-center gap-1 overflow-hidden whitespace-nowrap",
                      col.align === "right" && "justify-end",
                      col.align === "center" && "justify-center"
                    )}
                  >
                    <span className="truncate">{col.header}</span>
                    {sortable && (
                      <span className="shrink-0 text-muted-foreground/60">
                        {isSorted && sortDir === "asc" ? (
                          <ArrowUp className="h-3 w-3 text-primary" />
                        ) : isSorted && sortDir === "desc" ? (
                          <ArrowDown className="h-3 w-3 text-primary" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3" />
                        )}
                      </span>
                    )}
                  </div>
                  <span
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-primary/40"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => startResize(e, col.key)}
                  />
                </th>
              );
            })}
            {actions && (
              <th className="h-10 px-4 align-middle font-medium text-muted-foreground">
                {actionsHeader}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (actions ? 1 : 0)}
                className="p-8 text-center text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  "border-b transition-colors hover:bg-muted/50",
                  onRowClick && "cursor-pointer"
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => {
                  const content = col.cell
                    ? col.cell(row)
                    : (() => {
                        const v = (row as Record<string, unknown>)[col.key];
                        return v == null || v === "" ? "-" : String(v);
                      })();
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "p-4 align-middle overflow-hidden whitespace-nowrap text-ellipsis",
                        alignClass(col.align),
                        col.className
                      )}
                    >
                      {content}
                    </td>
                  );
                })}
                {actions && (
                  <td className="p-4 align-middle" onClick={(e) => e.stopPropagation()}>
                    {actions(row)}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
