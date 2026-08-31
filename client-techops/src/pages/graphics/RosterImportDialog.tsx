// テロップCG — 名簿（Excel）からのページ一括生成ダイアログ。
// docs/design/v4/graphics.md §6「大量ページの一括生成（受賞者20名分のネームなど）は
// テンプレート×名簿から作る」・§9 段5。
//
// `client-awards/src/oneshot/operator/ExcelImportDialog.tsx` の Phase 分割を参考にしたが、
// diff（新規/更新/変更なし）・列タイプの自動判定は無いぶんずっと軽い実装
// — ①ファイル選択 → ②部品・スロット選択＋列マッピング → ③プレビュー → ④一括作成 の4段。
import { useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { notifyError } from '@/lib/notify';
import {
  commitGraphicsRoster, previewGraphicsRoster, PART_DEFAULT_SLOT,
  type GraphicsPartKey, type GraphicsSlot, type RosterCommitResult, type RosterPreviewResult,
} from '@/lib/graphicsApi';
import { PART_FIELDS } from './pageFields';
import RosterMappingStep from './RosterMappingStep';

/** ページ名の代表フィールド（サーバー側 `roster-import.service.ts` と同じ対応。
 *  プレビューの見え方をサーバーの実際の判定と揃えるための表示専用の複製） */
const REPRESENTATIVE_FIELD: Record<GraphicsPartKey, string> = {
  name: 'mainText', title: 'text', list: 'text', ticker: 'text',
  countdown: 'prefix', score: 'text', flash: 'text', side: 'text', vote: 'text',
};

type Phase = 'select' | 'mapping' | 'preview' | 'creating' | 'done';

export default function RosterImportDialog({
  open, onOpenChange, projectId, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onImported: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('select');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RosterPreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [slot, setSlot] = useState<GraphicsSlot>('lower');
  const [partKey, setPartKey] = useState<GraphicsPartKey>('name');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [nameColumn, setNameColumn] = useState('');
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<RosterCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPhase('select'); setFile(null); setPreview(null); setSlot('lower');
    setPartKey('name'); setMapping({}); setNameColumn(''); setResult(null); setError(null);
  };

  const close = () => { onOpenChange(false); reset(); };

  const pickFile = async (f: File) => {
    setFile(f);
    setError(null);
    setLoadingPreview(true);
    try {
      const p = await previewGraphicsRoster(projectId, f);
      setPreview(p);
      setPartKey('name');
      setSlot(PART_DEFAULT_SLOT.name);
      setMapping({});
      setNameColumn('');
      setPhase('mapping');
    } catch {
      setError('Excel ファイルを読み込めませんでした');
    } finally {
      setLoadingPreview(false);
    }
  };

  const pickPart = (k: GraphicsPartKey) => {
    setPartKey(k);
    setSlot(PART_DEFAULT_SLOT[k]);
    setMapping({});
    setNameColumn('');
  };

  const runCommit = async () => {
    if (!file) return;
    setError(null);
    setCreating(true);
    setPhase('creating');
    try {
      const r = await commitGraphicsRoster(projectId, file, slot, partKey, mapping, nameColumn || undefined);
      setResult(r);
      setPhase('done');
      if (r.createdCount > 0) onImported();
    } catch {
      notifyError('一括作成に失敗しました');
      setPhase('preview');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="border-b border-border-faint px-4 py-3 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            名簿から一括生成
          </DialogTitle>
        </DialogHeader>

        {phase === 'select' && (
          <div className="flex flex-col items-center gap-4 p-8 sm:p-12">
            <p className="text-list text-muted-foreground">
              受賞者名簿などの Excel（.xlsx / .xls）から、同じ部品のページをまとめて作ります。
            </p>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-control-md bg-primary px-4 py-2.5 text-sub font-bold text-primary-foreground hover:opacity-90">
              <Upload className="h-4 w-4" aria-hidden="true" />
              {loadingPreview ? '解析中…' : 'Excel ファイルを選択'}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={loadingPreview}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); e.target.value = ''; }}
              />
            </label>
            {loadingPreview && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />}
            {error && (
              <p className="flex items-center gap-1.5 text-sub text-destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />{error}
              </p>
            )}
          </div>
        )}

        {phase === 'mapping' && preview && (
          <>
            <p className="px-4 pt-3 text-note text-muted-foreground sm:px-6">
              {file?.name} ・ {preview.totalRows}行 ・ {preview.headers.length}列
            </p>
            <RosterMappingStep
              headers={preview.headers}
              slot={slot}
              partKey={partKey}
              mapping={mapping}
              nameColumn={nameColumn}
              onSlotChange={setSlot}
              onPartKeyChange={pickPart}
              onMappingChange={setMapping}
              onNameColumnChange={setNameColumn}
            />
          </>
        )}

        {phase === 'preview' && preview && (
          <PreviewTable preview={preview} partKey={partKey} mapping={mapping} nameColumn={nameColumn} />
        )}

        {phase === 'creating' && (
          <div className="flex flex-col items-center gap-3 p-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
            <p className="text-sub">作成しています…</p>
          </div>
        )}

        {phase === 'done' && result && <DoneSummary result={result} />}

        <DialogFooter className="border-t border-border-faint px-4 py-3 sm:px-6">
          {error && phase !== 'select' && (
            <p className="mr-auto flex items-center gap-1.5 text-sub text-destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />{error}
            </p>
          )}
          {phase === 'mapping' && (
            <>
              <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setPhase('select')}>
                ファイル変更
              </Button>
              <Button type="button" className="min-h-[44px]" onClick={() => setPhase('preview')}>
                プレビュー
              </Button>
            </>
          )}
          {phase === 'preview' && (
            <>
              <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setPhase('mapping')}>
                戻る
              </Button>
              <Button type="button" className="min-h-[44px]" onClick={() => void runCommit()} disabled={creating}>
                {preview ? `一括作成（全${preview.totalRows}行）` : '一括作成'}
              </Button>
            </>
          )}
          {phase === 'done' && (
            <Button type="button" className="min-h-[44px]" onClick={close}>閉じる</Button>
          )}
          {(phase === 'select' || phase === 'creating') && (
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={close} disabled={creating}>
              <X className="mr-1 h-4 w-4" aria-hidden="true" />キャンセル
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ③ プレビュー: 先頭数行がどう変換されるかを表で見せる ────────────
function PreviewTable({
  preview, partKey, mapping, nameColumn,
}: {
  preview: RosterPreviewResult;
  partKey: GraphicsPartKey;
  mapping: Record<string, string>;
  nameColumn: string;
}) {
  const idxByHeader = new Map(preview.headers.map((h, i) => [h, i]));
  const fieldDefs = PART_FIELDS[partKey] ?? [];
  const repField = REPRESENTATIVE_FIELD[partKey];

  const rows = preview.sampleRows.map((row) => {
    const fields: Record<string, string> = {};
    for (const def of fieldDefs) {
      const header = mapping[def.key];
      const idx = header ? idxByHeader.get(header) : undefined;
      const v = idx != null ? (row[idx] ?? '').trim() : '';
      if (v) fields[def.key] = v;
    }
    const nameIdx = nameColumn ? idxByHeader.get(nameColumn) : undefined;
    const name = nameIdx != null ? (row[nameIdx] ?? '').trim() : (fields[repField] ?? '').trim();
    return { name, fields };
  });

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <p className="text-note text-muted-foreground">
        先頭 {rows.length} 行のプレビューです（全{preview.totalRows}行のうち）。ページ名が空の行は作成されません。
      </p>
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-[480px] text-sub">
          <thead className="bg-surface-subtle text-th text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">ページ名</th>
              {fieldDefs.map((def) => (
                <th key={def.key} className="px-3 py-2 text-left">{def.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border-faint">
                <td className="px-3 py-2 font-bold">
                  {r.name || <span className="text-destructive">（空欄・作成されません）</span>}
                </td>
                {fieldDefs.map((def) => (
                  <td key={def.key} className="px-3 py-2 text-muted-foreground">{r.fields[def.key] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ④ 完了サマリー ───────────────────────────────────────────────
function DoneSummary({ result }: { result: RosterCommitResult }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-7 w-7 text-success" aria-hidden="true" />
        <div>
          <p className="text-list font-bold">一括作成が完了しました</p>
          <p className="text-sub text-muted-foreground">
            作成 {result.createdCount}件
            {result.skippedBlank > 0 && ` ・ 空行スキップ ${result.skippedBlank}件`}
            {result.errors.length > 0 && ` ・ 作成できなかった行 ${result.errors.length}件`}
          </p>
        </div>
      </div>
      {result.errors.length > 0 && (
        <div className="rounded-card border border-warning-border bg-warning-surface p-3">
          <p className="mb-1 text-sub font-bold">作成できなかった行</p>
          <ul className="space-y-0.5 text-note text-muted-foreground">
            {result.errors.map((e, i) => (
              <li key={i}>Excel {e.row}行目: {e.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
