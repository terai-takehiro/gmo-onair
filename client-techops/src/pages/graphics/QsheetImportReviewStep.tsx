// テロップCG — 台本からの取り込みダイアログの②「取り込む行を確認する」段。
// `QsheetImportDialog.tsx` から切り出した（ファイルサイズ規律・400行）。
import { Inbox } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { PART_LABELS, type GraphicsPartKey } from '@/lib/graphicsApi';
import type { QsheetImportCandidate } from '@/lib/graphicsQsheetImportApi';
import { PART_KEYS } from './pageFields';

/**
 * 確認画面での1行ぶんの状態（候補＋チェック・種類の編集値）。
 * `qsheetRowId` は候補間で重複しうる（`graphicsQsheetImportApi.ts` 参照）ため、
 * 呼び出し側（`QsheetImportDialog`）は必ず配列のインデックスでこの行を管理すること。
 */
export type ReviewRow = QsheetImportCandidate & {
  checked: boolean;
  partKey: GraphicsPartKey;
};

export default function QsheetImportReviewStep({
  docTitle, rows, onToggle, onPartKeyChange,
}: {
  docTitle: string;
  rows: ReviewRow[];
  onToggle: (index: number, checked: boolean) => void;
  onPartKeyChange: (index: number, partKey: GraphicsPartKey) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          icon={<Inbox />}
          title="テロップ列に文言が見つかりませんでした"
          description="この台本にテロップ列が無いか、文言が入っている行がありません。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <p className="text-note text-muted-foreground">
        「{docTitle}」・チェックが付いている行を取り込みます（既定は全部オン）。
        並びはそのままコーナー・出す順になります。種類は取り込んだあとも直せます。
      </p>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto">
        {rows.map((row, index) => (
          <div key={index} className="flex items-start gap-3 rounded-card border border-border bg-card p-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0"
              checked={row.checked}
              onChange={(e) => onToggle(index, e.target.checked)}
              aria-label={`${row.text || '（無題）'} を取り込む`}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {row.section && (
                  <span className="shrink-0 rounded-badge-xs bg-surface-subtle px-1.5 py-0.5 text-badge text-muted-foreground">
                    {row.section}
                  </span>
                )}
                <span className="min-w-0 flex-1 break-words text-sub font-bold">{row.text}</span>
              </div>
              {row.memo && <p className="break-words text-note text-muted-foreground">{row.memo}</p>}
              <Select value={row.partKey} onValueChange={(v) => onPartKeyChange(index, v as GraphicsPartKey)}>
                <SelectTrigger className="min-h-[40px] w-full sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PART_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>{PART_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
