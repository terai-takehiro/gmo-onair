/**
 * データビューア — **選んだ表の中身**（並べ替え・1行ごとの編集/削除ボタン）
 *
 * ── 何のまとまりか ──────────────────────────────────────────
 *
 * 表頭（押すと並べ替え）と本文のマスだけ。**空のときは2型に出し分ける**
 * （絞り込んで 0 件 ／ そもそも 0 件）。混ぜると「検索が壊れている」のか
 * 「無い」のかが分からない。編集・削除のボタンはシステム管理者にだけ出す
 * （サーバー側も同じ縛りなので、出すと「押せるのに 403」になる）。
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * `DataViewerPage.tsx` が 400 行（1ファイルの上限）を大きく超えていたため、
 * **レール / 表の中身 / 行を直すダイアログ**に分けた。状態も通信も
 * `DataViewerPage.tsx` に残したままで、ここは受け取ったものを描くだけ。
 * **JSX は1文字も変えずに移してある。**
 */
import { ArrowUpDown, Database, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { COLUMN_LABELS, formatCell, isIdColumn, isMoneyColumn } from './columns';

export function DataTable({
  dataLoading, tableData, isSystemAdmin, sort, order, handleSort,
  canLogicallyDelete, openEdit, setDeletingRow, debouncedSearch,
}: {
  dataLoading: boolean;
  tableData: { data: Record<string, unknown>[]; columns: string[] } | undefined;
  isSystemAdmin: boolean;
  sort: string;
  order: 'ASC' | 'DESC';
  handleSort: (col: string) => void;
  /** `deleted_at` を持つ表だけ論理削除できる */
  canLogicallyDelete: boolean;
  openEdit: (row: Record<string, unknown>) => void;
  setDeletingRow: (row: Record<string, unknown> | null) => void;
  /** 空のときの文面を出し分けるためだけに受け取る（絞り込んで 0 件かどうか） */
  debouncedSearch: string;
}) {
  return (
    <div className="flex-1 overflow-auto">
      {dataLoading ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tableData && tableData.data.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isSystemAdmin && (
                  <TableHead className="w-24 sticky left-0 bg-card z-10 whitespace-nowrap">
                    操作
                  </TableHead>
                )}
                {tableData.columns.map(col => (
                  <TableHead
                    key={col}
                    className="cursor-pointer select-none whitespace-nowrap hover:bg-muted/50"
                    onClick={() => handleSort(col)}
                    title={col}
                  >
                    <div className="flex items-center gap-1">
                      {COLUMN_LABELS[col] || col}
                      <ArrowUpDown className={`h-3 w-3 ${sort === col ? "text-primary" : "text-muted-foreground/50"}`} />
                      {sort === col && (
                        <span className="text-xs text-primary">
                          {order === "ASC" ? "\u2191" : "\u2193"}
                        </span>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.data.map((row, ri) => (
                <TableRow key={ri}>
                  {isSystemAdmin && (
                    <TableCell className="sticky left-0 bg-card z-10 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {/* 28px はボタンの高さの段 (32/36/40/44/48) に無いので 32px にする (verify-ui.mjs) */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="編集"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canLogicallyDelete && !row.deleted_at && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="削除"
                            onClick={() => setDeletingRow(row)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                  {tableData.columns.map(col => {
                    const raw = row[col];
                    const display = formatCell(col, raw);
                    const fullText = raw !== null && raw !== undefined ? String(raw) : "";
                    const truncated = display.length > 30;
                    // 金額は shared の <Money> で描く (v4 の決めごと「¥と数字は別要素」— verify-ui.mjs が実測する)
                    const money = isMoneyColumn(col) && raw !== null && raw !== undefined && raw !== "" && Number.isFinite(Number(raw));
                    return (
                      <TableCell
                        key={col}
                        className={`whitespace-nowrap ${isIdColumn(col) ? " text-xs" : ""}`}
                        title={truncated ? fullText : undefined}
                      >
                        {money ? <Money inline value={Number(raw)} /> : truncated ? display.substring(0, 30) + "…" : display}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-1 text-muted-foreground">
          <Database className="h-10 w-10 mb-2" />
          {/* **空状態は2型**（絞り込んで 0 件／そもそも 0 件）。混ぜると「検索が壊れている」のか「無い」のかが分からない */}<p>{debouncedSearch ? '条件に合う行はありません。言葉を短くするか、絞り込みを外してください。' : 'この表にはまだ行がありません。'}</p>
        </div>
      )}
    </div>
  );
}
