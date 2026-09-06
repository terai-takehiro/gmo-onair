/**
 * データビューア — **左のレール（表の一覧）**
 *
 * ── 何のまとまりか ──────────────────────────────────────────
 *
 * アプリ別にグループ分けした表の一覧と、そこから1つ選ぶところだけ。
 * グループの定義に無い表（あとから足したもの）は「その他」に落ちるので、
 * **書き忘れても一覧から消えない**。
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * `DataViewerPage.tsx` が 400 行（1ファイルの上限）を大きく超えていたため、
 * **レール / 表の中身 / 行を直すダイアログ**に分けた。状態も通信も
 * `DataViewerPage.tsx` に残したままで、ここは受け取ったものを描くだけ。
 * **JSX は1文字も変えずに移してある。**
 */
import { Database, Loader2, Folder } from 'lucide-react';
import { TABLE_GROUPS, TABLE_LABELS, KNOWN_GROUPED_TABLES, type TableInfo } from './tables';

export function TableList({
  tablesLoading, tablesData, selectedTable, handleTableSelect,
}: {
  tablesLoading: boolean;
  tablesData: TableInfo[] | undefined;
  selectedTable: string;
  handleTableSelect: (name: string) => void;
}) {
  return (
    <>
        {/* Left sidebar - table list (grouped by app, v2.7.14+) */}
        <div className="w-full lg:w-64 flex-shrink-0 border-b lg:border-b-0 lg:border-r bg-muted/30 overflow-y-auto max-h-64 lg:max-h-none">
          <div className="p-3 border-b">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Database className="h-4 w-4" />
              テーブル一覧
            </div>
          </div>
          {tablesLoading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <nav className="p-2 space-y-3">
              {TABLE_GROUPS.map(group => {
                const groupTables = (tablesData ?? []).filter(t => group.tables.includes(t.name));
                if (groupTables.length === 0) return null;
                const Icon = group.icon;
                return (
                  <div key={group.id}>
                    <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Icon className="h-3 w-3" />
                      {group.label}
                    </div>
                    <div className="space-y-0.5">
                      {groupTables.map(table => (
                        <button
                          key={table.name}
                          onClick={() => handleTableSelect(table.name)}
                          className={`w-full text-left rounded-md px-3 py-1.5 text-sm transition-colors ${
                            selectedTable === table.name
                              ? "bg-primary text-white"
                              : "hover:bg-muted text-foreground"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate">{TABLE_LABELS[table.name] || table.name}</span>
                            <span className={`text-[11px] tabular-nums shrink-0 ${
                              selectedTable === table.name ? "text-white/80" : "text-muted-foreground"
                            }`}>
                              {table.count.toLocaleString()}
                            </span>
                          </div>
                          <span className={`block text-[11px]  truncate ${
                            selectedTable === table.name ? "text-white/60" : "text-muted-foreground/70"
                          }`}>
                            {table.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {/* グループ未定義のテーブル (新規追加されたテーブルなど) */}
              {(() => {
                const ungrouped = (tablesData ?? []).filter(t => !KNOWN_GROUPED_TABLES.has(t.name));
                if (ungrouped.length === 0) return null;
                return (
                  <div>
                    <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Folder className="h-3 w-3" />
                      その他
                    </div>
                    <div className="space-y-0.5">
                      {ungrouped.map(table => (
                        <button
                          key={table.name}
                          onClick={() => handleTableSelect(table.name)}
                          className={`w-full text-left rounded-md px-3 py-1.5 text-sm transition-colors ${
                            selectedTable === table.name
                              ? "bg-primary text-white"
                              : "hover:bg-muted text-foreground"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate">{TABLE_LABELS[table.name] || table.name}</span>
                            <span className={`text-[11px] tabular-nums shrink-0 ${
                              selectedTable === table.name ? "text-white/80" : "text-muted-foreground"
                            }`}>
                              {table.count.toLocaleString()}
                            </span>
                          </div>
                          <span className={`block text-[11px]  truncate ${
                            selectedTable === table.name ? "text-white/60" : "text-muted-foreground/70"
                          }`}>
                            {table.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </nav>
          )}
        </div>
    </>
  );
}
