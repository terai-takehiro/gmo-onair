// Excel を書き出す（4段: シートを選ぶ → 見出しの見本 → 点検 → キーの扱い）。impl doc §5-1 / §6-2。
// ⚠️ この Excel は台本の Excel（03-excel.md）とは完全に別物。ここでは meetings を一切扱わない
// （preflight も export-xlsx も meetings を見ない — 08 §5-4）。
//
// ⚠️ **点検も書き出しも「サーバーに保存済みの内容」しか見ない。**
// 画面に打ち込んだだけの値は渡らない。以前はそれを断りもせず走らせていたため、
// **12台ぶん打ち込んでそのまま書き出すと、点検は「0件」と出て、見出しだけの Excel が
// 「書き出しました」と一緒に落ちてきた**（監査 2026-08-22・実機で確認）。
// いまは未保存のときは先に保存させる。
import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { notifyError, notifySuccess } from '@/lib/notify';
import { apiErrorMessage } from '@/lib/deviceSettingsShared';
import { preflight, exportXlsx, type PreflightResult, type PreflightIssue } from '@/lib/deviceSettingsApi';

type Sheet = 'recording' | 'streaming';

/** 点検の3段。「赤」「橙」という内部の呼び名は画面に出さない */
function IssueBlock({
  title, tone, issues, note,
}: { title: string; tone: 'bad' | 'warn' | 'mute'; issues: PreflightIssue[]; note: string }) {
  const cls =
    tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-warning' : 'text-muted-foreground';
  if (issues.length === 0) {
    return <p className={`text-xs ${cls}`}>{title}: 0 件</p>;
  }
  return (
    <details className="text-xs">
      <summary className={`cursor-pointer ${cls}`}>{title}: {issues.length} 件</summary>
      <p className="mt-1 text-muted-foreground">{note}</p>
      <ul className={`mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4 ${cls}`}>
        {issues.map((r, i) => <li key={i}>{r.where}: {r.message}</li>)}
      </ul>
    </details>
  );
}

export default function ExportDialog({
  open, onOpenChange, ownerKey, date, dirty = false, onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerKey: string;
  date?: string;
  /** 画面に未保存の変更があるか。あるうちは点検も書き出しも当てにならない */
  dirty?: boolean;
  /** 「保存して続ける」で呼ぶ。成功したら true */
  onSave?: () => Promise<boolean>;
}) {
  const [sheets, setSheets] = useState<Sheet[]>(['recording', 'streaming']);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [keyMode, setKeyMode] = useState<'blank' | 'plain'>('blank');
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);

  const runPreflight = useCallback(() => {
    setChecking(true);
    setCheckFailed(false);
    preflight(ownerKey, date)
      .then(setResult)
      .catch(() => setCheckFailed(true))
      .finally(() => setChecking(false));
  }, [ownerKey, date]);

  useEffect(() => {
    if (!open) { setResult(null); setCheckFailed(false); return; }
    runPreflight();
  }, [open, runPreflight]);

  const toggleSheet = (s: Sheet) =>
    setSheets((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const saveThenRecheck = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      if (await onSave()) runPreflight();
    } finally {
      setSaving(false);
    }
  };

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
    } catch (e) {
      notifyError(apiErrorMessage(e, '書き出しに失敗しました'));
    } finally {
      setExporting(false);
    }
  };

  const previewSheets = result?.headerPreview.sheets.filter((s) =>
    (s.name === '収録設定' && sheets.includes('recording')) || (s.name === '配信設定' && sheets.includes('streaming'))
  ) ?? [];

  const blocked = dirty && !!onSave;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Excel を書き出す</DialogTitle></DialogHeader>

        {/* 未保存の断り。ここを素通しすると空の Excel が出る */}
        {blocked && (
          <div className="rounded-lg border border-warning-border bg-warning-surface p-3 text-sm">
            <p className="font-semibold text-warning">保存していない変更があります</p>
            <p className="mt-1 text-xs text-muted-foreground">
              点検も書き出しも<strong>保存済みの内容</strong>を見ます。このまま出すと、
              いま画面に打ち込んだ内容は Excel に入りません。
            </p>
            <Button className="mt-2 h-11 w-full" onClick={saveThenRecheck} disabled={saving}>
              {saving ? '保存中…' : '保存して続ける'}
            </Button>
          </div>
        )}

        <div className="space-y-5">
          {/* ① シートを選ぶ */}
          <section>
            <h3 className="mb-1 text-sm font-semibold">① シートに出すもの</h3>
            <p className="mb-2 text-xs text-muted-foreground">現地の Assistant は<strong>1枚目しか読みません</strong>。</p>
            <div className="flex flex-wrap gap-2">
              {(['recording', 'streaming'] as Sheet[]).map((s) => (
                <label key={s} className="flex min-h-[44px] items-center gap-2 rounded-lg border px-3 text-sm">
                  <input type="checkbox" checked={sheets.includes(s)} onChange={() => toggleSheet(s)} />
                  {s === 'recording' ? '収録設定' : '配信設定'}
                  {sheets[0] === s && <span className="rounded bg-primary/10 px-1 text-xs font-semibold text-primary">1枚目</span>}
                </label>
              ))}
            </div>
          </section>

          {/* ② 見出しの見本 */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">② 1枚目の見出し行の見本</h3>
            {previewSheets.length === 0 ? (
              <p className="text-xs text-muted-foreground">シートを選ぶと見出しが出ます</p>
            ) : (
              <div className="space-y-2">
                {previewSheets.map((s) => (
                  <div key={s.name} className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>{s.headers.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1 text-left font-semibold">{h}</th>)}</tr>
                      </thead>
                    </table>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  空欄で出したセルは<strong>現地の設定を変えません</strong>。TCソースの列は出しません（現地で必ず弾かれるため）。
                </p>
              </div>
            )}
          </section>

          {/* ③ 点検 */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">③ 点検</h3>
            {checking ? (
              <p className="text-xs text-muted-foreground">点検中…</p>
            ) : checkFailed ? (
              <div className="flex items-center gap-2">
                <p className="text-xs text-destructive">点検できませんでした。</p>
                <Button size="sm" variant="outline" className="h-9" onClick={runPreflight}>もう一度</Button>
              </div>
            ) : result ? (
              <div className="space-y-1">
                <IssueBlock title="直したほうがよい" tone="bad" issues={result.red}
                  note="このまま出すと現地で弾かれます。" />
                <IssueBlock title="そのままでよい" tone="warn" issues={result.amber}
                  note="空欄のまま出ます＝現地の設定を変えません。" />
                <IssueBlock title="Excel に出さない" tone="mute" issues={result.gray}
                  note="配信先が無い台・使わないと決めた台です。" />
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

        {result && result.red.length > 0 && (
          <p className="mt-4 text-sm font-semibold text-destructive">
            直したほうがよい {result.red.length} 件のまま書き出します
          </p>
        )}
        <Button
          className="mt-2 h-[52px] w-full text-base"
          onClick={doExport}
          disabled={exporting || sheets.length === 0 || blocked}
        >
          {exporting ? '書き出し中…' : blocked ? '先に保存してください' : '書き出す'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
