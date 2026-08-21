// Excel を書き出す（4段: シートを選ぶ → 見出しの見本 → 点検 → キーの扱い）。impl doc §5-1 / §6-2。
// ⚠️ この Excel は台本の Excel（03-excel.md）とは完全に別物。ここでは meetings を一切扱わない
// （preflight も export-xlsx も meetings を見ない — 08 §5-4）。
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { notifyError, notifySuccess } from '@/lib/notify';
import { preflight, exportXlsx, type PreflightResult } from '@/lib/deviceSettingsApi';

type Sheet = 'recording' | 'streaming';

export default function ExportDialog({
  open,
  onOpenChange,
  ownerKey,
  date,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerKey: string;
  date?: string;
}) {
  const [sheets, setSheets] = useState<Sheet[]>(['recording', 'streaming']);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [keyMode, setKeyMode] = useState<'blank' | 'plain'>('blank');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open) { setResult(null); return; }
    setChecking(true);
    preflight(ownerKey, date).then(setResult).catch(() => notifyError('点検に失敗しました')).finally(() => setChecking(false));
  }, [open, ownerKey, date]);

  const toggleSheet = (s: Sheet) =>
    setSheets((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const doExport = async () => {
    if (sheets.length === 0) { notifyError('出すシートを1つ以上選んでください'); return; }
    setExporting(true);
    try {
      const { blob, filename } = await exportXlsx(ownerKey, { date, sheets, keyMode });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notifySuccess('Excel を書き出しました');
      onOpenChange(false);
    } catch {
      notifyError('書き出しに失敗しました');
    } finally {
      setExporting(false);
    }
  };

  const previewSheets = result?.headerPreview.sheets.filter((s) =>
    (s.name === '収録設定' && sheets.includes('recording')) || (s.name === '配信設定' && sheets.includes('streaming'))
  ) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Excel を書き出す</DialogTitle></DialogHeader>

        <div className="space-y-5">
          {/* ① シートを選ぶ */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">① シートに出すもの</h3>
            <div className="flex flex-wrap gap-2">
              <label className="flex min-h-[44px] items-center gap-2 rounded-lg border px-3 text-sm">
                <input type="checkbox" checked={sheets.includes('recording')} onChange={() => toggleSheet('recording')} />
                収録設定
              </label>
              <label className="flex min-h-[44px] items-center gap-2 rounded-lg border px-3 text-sm">
                <input type="checkbox" checked={sheets.includes('streaming')} onChange={() => toggleSheet('streaming')} />
                配信設定
              </label>
            </div>
          </section>

          {/* ② 見出しの見本 */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">② 1枚目の見出し行の見本</h3>
            {previewSheets.length === 0 ? (
              <p className="text-xs text-muted-foreground">シートを選ぶと見出しが出ます</p>
            ) : (
              previewSheets.map((s, i) => (
                <p key={s.name} className="cond text-xs text-muted-foreground" style={{ transform: 'scaleX(0.94)', transformOrigin: 'left' }}>
                  {i === 0 && <span className="mr-1 rounded bg-primary/10 px-1 font-semibold text-primary">1枚目</span>}
                  {s.name}: {s.headers.join(' / ')}
                </p>
              ))
            )}
          </section>

          {/* ③ 点検 */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">③ 点検</h3>
            {checking ? (
              <p className="text-xs text-muted-foreground">点検中…</p>
            ) : result ? (
              <div className="space-y-1 text-xs">
                <p className="text-destructive">直したほうがよい: {result.red.length} 件</p>
                <p className="text-warning">そのままでよい: {result.amber.length} 件</p>
                <p className="text-muted-foreground">出さない: {result.gray.length} 件</p>
                {result.red.length > 0 && (
                  <ul className="mt-1 max-h-24 list-disc space-y-0.5 overflow-y-auto pl-4 text-destructive">
                    {result.red.slice(0, 10).map((r, i) => <li key={i}>{r.where}: {r.message}</li>)}
                  </ul>
                )}
              </div>
            ) : null}
          </section>

          {/* ④ 鍵の扱い */}
          {sheets.includes('streaming') && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">④ ストリームキーの扱い</h3>
              <div className="flex flex-col gap-2">
                <label className="flex min-h-[44px] items-center gap-2 rounded-lg border px-3 text-sm">
                  <input type="radio" name="keyMode" checked={keyMode === 'blank'} onChange={() => setKeyMode('blank')} />
                  空欄で出す（現地のキーを変えない）
                </label>
                <label className="flex min-h-[44px] items-center gap-2 rounded-lg border border-destructive/40 px-3 text-sm">
                  <input type="radio" name="keyMode" checked={keyMode === 'plain'} onChange={() => setKeyMode('plain')} />
                  <span>キーを入れる<span className="ml-1 text-destructive">（Excel に平文で入ります。取り扱いに注意）</span></span>
                </label>
              </div>
            </section>
          )}
        </div>

        <Button className="mt-6 h-[52px] w-full text-base" onClick={doExport} disabled={exporting || sheets.length === 0}>
          {exporting ? '書き出し中…' : `書き出す${result ? `（赤 ${result.red.length} 件）` : ''}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
