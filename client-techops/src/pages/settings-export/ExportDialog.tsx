// Excel を書き出す（4段: シートを選ぶ → 中身の見本 → 点検 → キーの扱い）。impl doc §5-1 / §6-2。
// モックは `docs/design/v4/qsheet-v4-coding/mockups/tech-settings/Export.dc.html`。
//
// ⚠️ この Excel は台本の Excel（03-excel.md）とは完全に別物。ここでは meetings を一切扱わない
// （preflight も export-xlsx も meetings を見ない — 08 §5-4）。
//
// ⚠️ **点検も書き出しも「サーバーに保存済みの内容」しか見ない。**
// 画面に打ち込んだだけの値は渡らない。以前はそれを断りもせず走らせていたため、
// **12台ぶん打ち込んでそのまま書き出すと、点検は「0件」と出て、見出しだけの Excel が
// 「書き出しました」と一緒に落ちてきた**（監査 2026-08-22・実機で確認）。
// いまは未保存のときは先に保存させ、さらに**中身の見本**を出して
// 「1行も入っていない」を目で分かるようにした（②の段）。
//
// ⚠️ **作り直しの経緯**（監査 2026-08-22）: 前の実装はモックの上半分（HTML）だけを写し、
// 下半分（`<script type="text/x-dc">` の `class Component`）に書かれた**操作と判定**を
// 落としていた。そのため「見出しだけの見本」「灰色が台数ぶん並ぶ」「入力ガイドの説明が無い」
// 「ファイル名が出ない」「シートを外しても点検が変わらない」が同時に起きていた。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useCanEditDeviceSettings } from '@/lib/useCanEditDeviceSettings';
import { preflight, exportXlsx, exportErrorMessage, type PreflightResult } from '@/lib/deviceSettingsApi';
import PreviewTable from './PreviewTable';
import PreflightSummary from './PreflightSummary';
import {
  SHEET_DEFS, GUIDE_SHEET_NAME, GUIDE_SHEET_DESC, visiblePreviewSheets, sheetPosition, type Sheet,
} from './exportPlan';

/** 段の見出し（モックの丸数字）。番号を画面に出すのは「あと何段あるか」が分かるため */
function StepTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-chip bg-foreground tabular-nums text-badge text-background">
        {n}
      </span>
      <span className="text-list">{title}</span>
      {hint && <span className="text-sub-sm text-muted-foreground">{hint}</span>}
    </div>
  );
}

export default function ExportDialog({
  open, onOpenChange, ownerKey, date, dirty = false, onSave, primarySheet = 'recording',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerKey: string;
  date?: string;
  /** 画面に未保存の変更があるか。あるうちは点検も書き出しも当てにならない */
  dirty?: boolean;
  /** 「保存して続ける」で呼ぶ。成功したら true */
  onSave?: () => Promise<boolean>;
  /**
   * 開いた画面のシート。**1枚目（= Assistant が読む唯一のシート）にする**。
   * ⚠️ 以前はサーバーが常に「収録 → 配信」の順で積んだため、配信設定の画面から
   * 既定のまま書き出すと配信設定が2枚目になり、現地でそのまま取り込めなかった。
   */
  primarySheet?: Sheet;
}) {
  /**
   * ⚠️ **権限で止めるのは「キーを入れて出す」だけ**（監査 2026-08-22 の宿題への答え）。
   *
   * 書き出しそのものは止めない — 現地に渡す紙を作るのは閲覧しかできない人の仕事のことがあり、
   * Excel に出る内容は**その人が画面で見られるものと同じ**だから、ここで止めても守るものが無い。
   * 一方 `keyMode: 'plain'` はストリームキーの**平文**をファイルに落とす操作で、画面ですら
   * 伏せ字でしか出さない決めごと（08 §2）を破る。**破ってよいのは編集できる人だけ**にする。
   * サーバーの `export-xlsx` も同じ線（keyMode=plain のときだけ editor を要求）。
   */
  const canEdit = useCanEditDeviceSettings();

  /**
   * ⚠️ **並び＝シートの並び**（サーバーの `buildSheetSpecs` は配列の順に積む）。
   * 既定は「開いている画面のシートが1枚目」。チェックを入れ直すと末尾に足される
   * （何枚目になるかは②の見本とバッジがサーバーの並びで示す）。
   */
  const defaultSheets: Sheet[] = primarySheet === 'streaming' ? ['streaming', 'recording'] : ['recording', 'streaming'];
  const [sheets, setSheets] = useState<Sheet[]>(defaultSheets);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [keyMode, setKeyMode] = useState<'blank' | 'plain'>('blank');
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * ⚠️ 引き直しの**追い越し**を止める番号。シートのチェックを続けて2回押すと
   * 2本目のほうが先に返ることがあり、そのまま入れると**選択と食い違う見本**が残る。
   */
  const reqRef = useRef(0);

  const runPreflight = useCallback(() => {
    const seq = ++reqRef.current;
    // ⚠️ 1枚も選んでいないときは**引かない**。サーバーは `sheets` が空だと
    // 「指定なし = 両方」と読むので、そのまま投げると**外したシートの赤が全部出る**
    // （この画面がいちばん誤解を招く状態）。ここは点検そのものを止めて、
    // 「1つ以上選んでください」だけを出す。
    if (sheets.length === 0) { setResult(null); setChecking(false); setCheckFailed(false); return; }
    setChecking(true);
    setCheckFailed(false);
    // ⚠️ `sheets` を渡す。渡さないとサーバーは両方を点検し、
    // **外したはずのシートの赤**が出続ける（監査 2026-08-22）。
    // `keyMode` も渡す — 渡さないと「キーを入れて出す」を選んでも
    // **見本のキー列が（空欄）のまま**で、見本が実物と食い違う
    preflight(ownerKey, { date, sheets, keyMode: canEdit ? keyMode : 'blank' })
      .then((r) => { if (seq === reqRef.current) setResult(r); })
      .catch(() => { if (seq === reqRef.current) setCheckFailed(true); })
      .finally(() => { if (seq === reqRef.current) setChecking(false); });
  }, [ownerKey, date, sheets, keyMode, canEdit]);

  // ⚠️ `sheets` は `runPreflight` の依存に入っているので、**選択が確定した時点で1回だけ**引き直る
  // （打鍵ごとに叩かない）。開いていないときは引かない。
  useEffect(() => {
    if (!open) { setResult(null); setCheckFailed(false); return; }
    runPreflight();
  }, [open, runPreflight]);

  // 開き直したら並びを既定（開いている画面が1枚目）へ戻す。
  // 前回の選択が残ると「1枚目のつもりが2枚目」が起きる
  useEffect(() => {
    if (open) setSheets(primarySheet === 'streaming' ? ['streaming', 'recording'] : ['recording', 'streaming']);
  }, [open, primarySheet]);

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
      // 権限が落ちた状態で `plain` が残っていても平文を要求しない（画面の分岐だけに頼らない）
      const { blob, filename } = await exportXlsx(ownerKey, {
        date, sheets, keyMode: canEdit ? keyMode : 'blank',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notifySuccess('書き出しました。現場では Assistant で読み込んでください');
      onOpenChange(false);
    } catch (e) {
      notifyError(await exportErrorMessage(e, '書き出せませんでした。少し待ってから、もう一度お試しください。'));
    } finally {
      setExporting(false);
    }
  };

  const preview = result?.preview ?? [];
  const shown = visiblePreviewSheets(preview, sheets);
  const blocked = dirty && !!onSave;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Excel を書き出す</DialogTitle></DialogHeader>

        {/* 未保存の断り。ここを素通しすると中身の無い Excel が出る */}
        {blocked && (
          <div className="rounded-card border border-warning-border bg-warning-surface p-3">
            <p className="text-list text-warning">保存していない変更があります</p>
            <p className="mt-1 text-sub-sm text-muted-foreground">
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
            <StepTitle n={1} title="出すシートを選ぶ" hint="Assistant は 1 枚目しか読みません（この画面のシートを 1 枚目にしてあります）" />
            <div className="flex flex-col gap-2">
              {SHEET_DEFS.map((def) => {
                const on = sheets.includes(def.key);
                const pos = on ? sheetPosition(preview, def.sheetName) : null;
                return (
                  <label
                    key={def.key}
                    className={`flex min-h-tap cursor-pointer items-center gap-3 rounded-control-lg border px-3 py-2 ${
                      on ? 'border-warning-border bg-warning-surface' : ''
                    }`}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleSheet(def.key)} />
                    {/*
                      何枚目になるかを常に出す（モック下半分の `pos`）。外しているときは「—」。
                      番号は**サーバーが実際に並べる順**（＝選んだ順。`buildSheetSpecs` は
                      `?sheets=` の並びのまま積み、入力ガイドを最後に足す）。
                    */}
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-control tabular-nums text-badge ${
                      on ? 'bg-warning-surface text-warning' : 'bg-muted text-muted-foreground'
                    }`}>
                      {pos ?? '—'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-list">
                        {def.label}
                        {pos === 1 && (
                          <span className="ml-2 rounded-badge bg-primary-surface px-1.5 text-badge text-primary">1枚目</span>
                        )}
                      </span>
                      <span className="block text-sub-sm text-muted-foreground">{def.desc}</span>
                    </span>
                  </label>
                );
              })}
              {/*
                ⚠️ 入力ガイドは**外せない**（サーバーが必ず付ける・#279 §4-4）。
                モックではトグルだったが、外せるように見せると「外したのに入っている」になる。
              */}
              <div className="flex min-h-tap items-center gap-3 rounded-control-lg border px-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control bg-muted tabular-nums text-badge text-muted-foreground">
                  {sheetPosition(preview, GUIDE_SHEET_NAME) ?? '—'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-list">
                    {GUIDE_SHEET_NAME}
                    <span className="ml-2 rounded-badge bg-muted px-1.5 text-badge text-muted-foreground">必ず付きます</span>
                  </span>
                  <span className="block text-sub-sm text-muted-foreground">{GUIDE_SHEET_DESC}</span>
                </span>
              </div>
            </div>
          </section>

          {/* ② 中身の見本（見出しだけでは「空の Excel」に気づけない） */}
          <section>
            <StepTitle n={2} title="出るものを確かめる" hint="先頭の数行だけ・実物と同じ整形です" />
            {shown.length === 0 ? (
              <p className="text-sub-sm text-muted-foreground">
                {checking ? '見本を作っています…' : 'シートを1つ以上選ぶと、出る中身が見えます'}
              </p>
            ) : (
              <div className="space-y-2">
                {shown.map((s) => (
                  <PreviewTable
                    key={s.name}
                    sheet={s}
                    position={sheetPosition(preview, s.name)}
                    note={s.name === GUIDE_SHEET_NAME ? GUIDE_SHEET_DESC : undefined}
                  />
                ))}
                <p className="text-sub-sm text-muted-foreground">
                  薄い橙のセルは<strong>空欄で出ます</strong>＝現地の設定を変えません。
                  <strong>TCソースの列は出しません</strong>（現地で必ず弾かれるため）。
                  ストリームキーは見本では伏せ字（<code>****</code>）にしています。
                </p>
              </div>
            )}
          </section>

          {/* ③ 点検 */}
          <section>
            <StepTitle n={3} title="書き出す前の点検" />
            {sheets.length === 0 ? (
              // 選んでいないものを点検しても意味が無いので、前の結果も残さない
              <p className="text-sub-sm text-muted-foreground">シートを1つ以上選ぶと点検します</p>
            ) : checking && !result ? (
              <p className="text-sub-sm text-muted-foreground">点検中…</p>
            ) : checkFailed ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sub-sm text-destructive">点検できませんでした。</p>
                <Button size="sm" variant="outline" className="h-9" onClick={runPreflight}>もう一度</Button>
              </div>
            ) : result ? (
              <PreflightSummary red={result.red} amber={result.amber} gray={result.gray} />
            ) : null}
          </section>

          {/* ④ 鍵の扱い */}
          {sheets.includes('streaming') && (
            <section>
              <StepTitle n={4} title="ストリームキーの扱い" />
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className={`flex min-h-tap flex-1 cursor-pointer items-center gap-3 rounded-control-lg border px-3 py-2 ${
                  keyMode === 'blank' ? 'border-warning-border bg-warning-surface' : ''
                }`}>
                  <input type="radio" name="keyMode" checked={keyMode === 'blank'} onChange={() => setKeyMode('blank')} />
                  <span className="min-w-0">
                    <span className="block text-list">空欄で出す（推奨）</span>
                    <span className="block text-sub-sm text-muted-foreground">現地に入っているキーをそのまま残します</span>
                  </span>
                </label>
                <label className={`flex min-h-tap flex-1 items-center gap-3 rounded-control-lg border px-3 py-2 ${
                  !canEdit ? 'opacity-60' : 'cursor-pointer'
                } ${keyMode === 'plain' ? 'border-destructive-border bg-destructive-surface' : ''}`}>
                  <input
                    type="radio"
                    name="keyMode"
                    checked={keyMode === 'plain'}
                    disabled={!canEdit}
                    onChange={() => setKeyMode('plain')}
                  />
                  <span className="min-w-0">
                    <span className="block text-list">キーを入れて出す</span>
                    <span className="block text-sub-sm text-muted-foreground">
                      {canEdit
                        ? '新しく設定するときはこちら'
                        : '平文のキーを出せるのは編集できる人だけです'}
                    </span>
                  </span>
                </label>
              </div>
              {keyMode === 'plain' && (
                <div className="mt-2 rounded-card border border-destructive-border bg-destructive-surface p-3">
                  <p className="text-sub text-destructive">
                    <strong>キーが平文で Excel に入ります。</strong>
                    このファイルはメールや共有フォルダに置かないでください。誰がいつ出したかは履歴に残します。
                  </p>
                </div>
              )}
            </section>
          )}

        </div>

        {/* 下端: ファイル名 → 赤の件数 → 書き出す（モック下半分の footer と同じ並び） */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sub font-bold" title={result?.filename}>
              {result?.filename ?? '（点検すると出ます）'}
            </p>
            <p className="text-sub-sm text-muted-foreground">この名前で保存されます</p>
          </div>
          {result && result.red.length > 0 && (
            // ⚠️ 赤があっても書き出しは止めない（08 §6）。**件数は必ずボタンの手前に出す**
            <p className="tabular-nums text-sub font-bold text-destructive">
              要修正 {result.red.length} 件のまま書き出します
            </p>
          )}
          <Button
            className="h-11 w-full sm:w-auto"
            onClick={doExport}
            disabled={exporting || sheets.length === 0 || blocked}
          >
            {exporting ? '書き出し中…' : blocked ? '先に保存してください' : '書き出す'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
