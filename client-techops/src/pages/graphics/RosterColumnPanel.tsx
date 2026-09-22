// テロップCG — 名簿インポートの列一覧（型バッジ＋推奨マッピングのハイライト）。
// `RosterMappingStep.tsx` から切り出した（ファイルサイズ規律・400行）。
//
// `client-awards/src/oneshot/operator/ExcelImportDialog.tsx` の `ColumnCard` を参考にしたが、
// awards の CG項目カタログ（グループ化・複数選択肢からの割当プルダウン）はそのまま持ち込まず、
// ここでは「型バッジ＋サンプル＋推奨のワンクリック採用ボタン」だけに絞った軽い実装
// （実際の割当は下の RosterMappingStep 側のプルダウンが担う）。
import { CalendarDays, FileText, Hash, Inbox, Sparkles, Type } from 'lucide-react';
import type { RosterColumnAnalysis, RosterColumnType } from '@/lib/graphicsRosterApi';
import type { PartFieldDef } from './pageFields';

// `cat-1`〜`cat-8`（意味を持たない見分けの色。shared/CLAUDE.md）を使う — 型の違いは
// 「危険/正常」のような状態ではないので、状態色（success/warning/destructive）を流用しない。
// `cat-5` は白地で文字に使うと薄すぎる決まりのため避けている。
const TYPE_META: Record<RosterColumnType, { label: string; icon: typeof Type; cls: string }> = {
  shortText: { label: '短文', icon: Type, cls: 'border-cat-1/30 bg-cat-1/10 text-cat-1' },
  longText: { label: '長文', icon: FileText, cls: 'border-cat-2/30 bg-cat-2/10 text-cat-2' },
  date: { label: '日付', icon: CalendarDays, cls: 'border-cat-3/30 bg-cat-3/10 text-cat-3' },
  number: { label: '数値', icon: Hash, cls: 'border-cat-4/30 bg-cat-4/10 text-cat-4' },
  empty: { label: '空', icon: Inbox, cls: 'border-border bg-surface-subtle text-muted-foreground' },
};

export default function RosterColumnPanel({
  columns, fieldDefs, mapping, loading, onAdopt,
}: {
  columns: RosterColumnAnalysis[];
  /** 現在選択中の部品のフィールド定義（`kind` 付きの可変長欄は呼び出し側で除外済み） */
  fieldDefs: PartFieldDef[];
  mapping: Record<string, string>;
  /** 部品を切り替えた直後、推奨マッピングを再計算中かどうか */
  loading?: boolean;
  onAdopt: (fieldKey: string, header: string) => void;
}) {
  if (columns.length === 0) return null;

  const labelByKey = new Map(fieldDefs.map((d) => [d.key, d.label]));
  const usedHeaders = new Set(Object.values(mapping));

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-th font-bold text-muted-foreground">
        列ごとの内容（自動判定）
        {loading && <span className="text-note font-normal">割り当ての候補を作り直しています…</span>}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {columns.map((col) => {
          const meta = TYPE_META[col.type];
          const Icon = meta.icon;
          const suggestedLabel = col.suggestedKey ? labelByKey.get(col.suggestedKey) : undefined;
          const alreadyMapped = usedHeaders.has(col.header);

          return (
            <div key={col.header} className="space-y-1.5 rounded-card border border-border bg-card p-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-badge-xs border px-1.5 py-0.5 text-note font-bold ${meta.cls}`}>
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  {meta.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-sub font-bold">{col.header}</span>
              </div>
              <div className="min-h-[1.25rem] break-words text-note text-muted-foreground">
                {col.samples.length > 0
                  ? col.samples.join(' / ')
                  : <span className="text-fg-disabled">（空）</span>}
              </div>
              {suggestedLabel && col.suggestedKey && !alreadyMapped && (
                <button
                  type="button"
                  onClick={() => onAdopt(col.suggestedKey!, col.header)}
                  className="flex w-full items-center gap-1.5 rounded-control border border-primary-border bg-primary-surface px-2 py-1.5 text-note text-primary hover:bg-primary-surface-weak"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">推奨: → <strong>{suggestedLabel}</strong></span>
                  <span className="ml-auto shrink-0 text-note text-muted-foreground">
                    {col.suggestedConfidence === 'exact' ? '名前一致' : '類似一致'}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
