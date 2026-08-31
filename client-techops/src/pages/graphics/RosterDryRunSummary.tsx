// テロップCG — 名簿インポートの dry-run 結果（投入前の件数確認）。
// `RosterImportDialog.tsx` から切り出した（ファイルサイズ規律・400行）。
import { AlertCircle, Info } from 'lucide-react';
import type { RosterCommitResult } from '@/lib/graphicsApi';

export default function RosterDryRunSummary({ result }: { result: RosterCommitResult }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-3 rounded-card border border-info-border bg-info-surface p-3">
        <Info className="h-5 w-5 shrink-0 text-info" aria-hidden="true" />
        <div>
          <p className="text-list font-bold">確認（まだ作成していません）</p>
          <p className="text-sub text-muted-foreground">
            下の件数でよければ「投入する」を押してください。全{result.createdCount + result.skippedBlank + result.errors.length}行を読みました。
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Stat label="作成される" value={result.createdCount} cls="border-success-border bg-success-surface text-success" />
        {result.skippedBlank > 0 && (
          <Stat label="空行スキップ" value={result.skippedBlank} cls="border-border bg-surface-subtle text-muted-foreground" />
        )}
        {result.errors.length > 0 && (
          <Stat label="ページ名が空" value={result.errors.length} cls="border-warning-border bg-warning-surface text-warning" />
        )}
      </div>

      {result.errors.length > 0 && (
        <div className="rounded-card border border-warning-border bg-warning-surface p-3">
          <p className="mb-1 flex items-center gap-1.5 text-sub font-bold">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            作成されない行（ページ名になる列が空）
          </p>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-note text-muted-foreground">
            {result.errors.map((e, i) => (
              <li key={i}>Excel {e.row}行目: {e.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`flex min-w-[96px] flex-col items-center justify-center gap-0.5 rounded-card border px-3 py-2 ${cls}`}>
      <span className="text-h2 tabular-nums leading-none">{value}</span>
      <span className="text-note font-bold">{label}</span>
    </div>
  );
}
