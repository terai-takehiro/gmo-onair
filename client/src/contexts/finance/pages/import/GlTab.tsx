/**
 * 総勘定元帳（決算の取り込み）のタブ (⑦ 取り込み・v4)
 *
 * 旧 `KessanImportPage.tsx`。freee の総勘定元帳 / MoneyForward の xlsx を
 * 財務管理・案件管理へ取り込みます。
 *
 * ── 触るときに知っておくこと ────────────────────────────────
 *
 * **投入（commit）は物理削除を伴います。** サーバーは対象月のマーカー
 * `[kessan:YYYY-MM]` が付いた行を `DELETE FROM` で消してから入れ直します
 * （論理削除ではありません）。だから「何度でも安全に再実行できる」一方で、
 * **対象や取り込み元を変えて投入すると、意図しない範囲が入れ直されます**。
 * 4つのトグルの既定値は旧実装から変えていません。
 */
import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, AlertTriangle, Database, CloudUpload, FileSpreadsheet, X } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { ImportScope, KessanReport } from './types';

const TOGGLES = [
  { key: 'createMasters', label: '案件・顧客・取引先を自動で作る', note: '売上・仕入の取り込みに必要です' },
  { key: 'excludeFixed', label: '固定原価（GLS なし）を除く', note: '' },
  { key: 'skipDuplicates', label: '重複候補（同じ金額＋内容＋日付）を飛ばす', note: '' },
] as const;

export function GlTab({ onStep }: { onStep: (n: 1 | 2 | 3) => void }) {
  const [scope, setScope] = useState<ImportScope>('all');
  const [flags, setFlags] = useState({ createMasters: true, excludeFixed: false, skipDuplicates: true });
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<KessanReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // 「いま選ばれているファイル」と「いま投げているリクエストが対象にしたファイル」を
  // ref で持つ。読み取り中に別のファイルへ選び直された場合、あとから届く古いレスポンスを
  // 見分けて捨てるため（state のクロージャだと古い値を掴んだままになりうるので使わない）。
  const currentFileRef = useRef<File | null>(null);
  const requestFileRef = useRef<File | null>(null);

  const run = useMutation<KessanReport, Error, boolean>({
    mutationFn: async (commit) => {
      if (!file) throw new Error('総勘定元帳ファイルを選択してください');
      requestFileRef.current = file;
      const fd = new FormData();
      fd.append('file', file);
      fd.append('scope', scope);
      fd.append('commit', String(commit));
      fd.append('createMasters', String(flags.createMasters));
      fd.append('excludeFixed', String(flags.excludeFixed));
      fd.append('skipDuplicates', String(flags.skipDuplicates));
      return (await api.post('/admin/kessan/run', fd, {
        timeout: 180_000,
        headers: { 'Content-Type': 'multipart/form-data' },
      })).data.data as KessanReport;
    },
    onSuccess: (d) => {
      // 読み取り中にファイルが選び直されていたら、この結果は古い（別の）ファイルの
      // ものなので反映しない（選び直した時点で selectFile が report/step を消している）。
      if (requestFileRef.current !== currentFileRef.current) return;
      setReport(d);
      onStep(d.dryRun ? 2 : 3);
      if (!d.dryRun) notifySuccess('取り込みました');
    },
    onError: (err) => notifyApiError('総勘定元帳を取り込めませんでした', err, 'ファイルの形式（freee CSV / MoneyForward xlsx）を確かめてください。'),
  });

  // ファイルの選び直し・取り消しは、それまでの下書き結果（report）を必ず捨てる。
  // 捨てないと「別のファイルを選んだのに前のファイルの下書きのまま投入」ができてしまう。
  const selectFile = (f: File | null) => {
    currentFileRef.current = f;
    setFile(f);
    setReport(null);
    onStep(1);
  };

  const commit = async () => {
    const prod = report?.isProd;
    const ok = await confirmAction({
      title: `${prod ? '本番の' : '検証の'}データベースに決算データを入れます`,
      description: `対象月ぶん（マーカー \`[kessan:${report?.period ?? '…'}]\`）は**いったん削除してから入れ直します**。`
        + (prod ? '\n\n**本番のデータベース**に書き込みます。先に「読み取る（下書き）」で件数・金額・重複候補を必ず確かめてください。' : ''),
      confirmLabel: '入れる',
      tone: prod ? 'danger' : 'default',
    });
    if (ok) run.mutate(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-control-lg flex items-start gap-2 border border-warning-border bg-warning-surface p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sub text-secondary-foreground">
          アップロードした総勘定元帳ファイルを財務管理・案件管理へ取り込みます。
          まず<strong className="font-bold">「読み取る（下書き）」</strong>で中身を確かめ、問題なければ入れてください。
          対象月ぶんを入れ直す形なので<strong className="font-bold">何度でもやり直せます</strong>。
          本番・検証のどちらでも動きます（取り込み先は結果に出ます）。
        </p>
      </div>

      <div className="rounded-card flex flex-col gap-4 border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>対象</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ImportScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて（販管費・売上・仕入）</SelectItem>
                <SelectItem value="sga">販管費だけ</SelectItem>
                <SelectItem value="revenues">売上だけ</SelectItem>
                <SelectItem value="purchases">仕入だけ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col justify-end gap-1.5">
            {TOGGLES.map((t) => (
              <label key={t.key} className="text-sub flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={flags[t.key]}
                  onChange={(e) => setFlags((p) => ({ ...p, [t.key]: e.target.checked }))}
                />
                <span>
                  {t.label}
                  {t.note && <span className="text-note block text-muted-foreground">{t.note}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label>総勘定元帳ファイル（freee の CSV または MoneyForward の xlsx）</Label>
          <div
            role="button"
            tabIndex={0}
            aria-label="総勘定元帳ファイルをドラッグ＆ドロップ、またはクリックして選択"
            className={`rounded-control-lg min-h-tap cursor-pointer border-2 border-dashed p-5 text-center transition-colors ${
              dragOver ? 'border-primary bg-primary-surface-weak' : 'border-border hover:border-primary'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) {
                selectFile(f);
                // ネイティブ input 側の選択も消しておく。消さないと、ドロップで
                // 別ファイルに替えたあと「ドロップ前に選んでいたファイル」を
                // ピッカーで選び直しても change イベントが発火しないことがある。
                if (fileInputRef.current) fileInputRef.current.value = '';
              }
            }}
          >
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-sub truncate font-bold">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="ファイルを取り消す"
                  className="min-h-tap min-w-tap"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectFile(null);
                    // 同じファイルを選び直したときも change イベントが発火するよう、
                    // ネイティブ input 側の選択も一緒に消す（消さないとブラウザが
                    // 「選択が変わっていない」と見なし、同じファイルの再選択を無視する）。
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <>
                <CloudUpload className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sub mt-1.5 font-bold">
                  freee の総勘定元帳CSV または MoneyForward の xlsx をドラッグ＆ドロップ
                </p>
                <p className="text-note mt-0.5 text-muted-foreground">またはクリックして選択</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { selectFile(e.target.files?.[0] ?? null); }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={run.isPending || !file} onClick={() => run.mutate(false)}>
            {run.isPending && !run.variables
              ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Database className="mr-1 h-4 w-4" aria-hidden="true" />}
            読み取る（下書き）
          </Button>
          <Button disabled={run.isPending || !report || !file} onClick={commit}>
            {run.isPending && run.variables && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            台帳に入れる
          </Button>
          {!report && (
            <span className="text-note self-center text-muted-foreground">
              先に「読み取る（下書き）」で中身を確かめてください
            </span>
          )}
        </div>
      </div>

      {report && <GlReport report={report} />}
    </div>
  );
}

function GlReport({ report }: { report: KessanReport }) {
  const dupTotal = report.duplicates
    ? report.duplicates.sga + report.duplicates.revenues + report.duplicates.purchases : 0;
  const ROWS = [
    ['販管費', report.summary.sga],
    ['売上', report.summary.revenues],
    ['仕入', report.summary.purchases],
    [`固定原価（→ ${report.summary.fixedCogs.routed}）`, report.summary.fixedCogs],
  ] as const;

  return (
    <div className="rounded-card flex flex-col gap-4 border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <TableBadge
          label={report.dryRun ? '下書き（未投入）' : '取り込み済み'}
          w={null}
          className={report.dryRun
            ? 'border-transparent bg-info-surface text-info'
            : 'border-transparent bg-success-surface text-success'}
        />
        <TableBadge
          label={`取り込み先: ${report.isProd ? '本番' : '検証'}（${report.targetDb}）`}
          w={null}
          className={report.isProd
            ? 'border-transparent bg-destructive-surface text-destructive'
            : 'border-transparent bg-muted text-muted-foreground'}
        />
      </div>

      <p className="text-sub text-secondary-foreground">
        対象期間:{' '}
        <strong className="font-bold text-foreground">
          {report.dateRange?.from && report.dateRange?.to
            ? `${report.dateRange.from} 〜 ${report.dateRange.to}` : report.period}
        </strong>
        {report.dateRange?.months?.length ? `（${report.dateRange.months.join('、')}）` : ''}
        <span className="text-note mt-0.5 block text-muted-foreground">
          マーカー月 {report.period} ／ 区分 {report.scopes.join('、')}
          {report.sourceFile ? ` ／ 取り込み元 ${report.sourceFile}` : ''}
        </span>
      </p>

      <div className="flex flex-col">
        <RowHeader className="hidden sm:flex">
          <RowMain>区分</RowMain>
          <RowSlot w={72} align="right">件数</RowSlot>
          <RowSlot w={160} align="right">金額</RowSlot>
        </RowHeader>
        {ROWS.map(([label, s]) => (
          <Row key={label}>
            <RowMain>{label}</RowMain>
            <RowSlot w={72} align="right"><span className="font-number">{s.count}</span></RowSlot>
            <MoneyCell value={s.amount} width={160} />
          </Row>
        ))}
      </div>

      {report.committed && (
        <p className="text-sub text-secondary-foreground">
          入った件数：販管費 <strong className="font-bold">{report.committed.sga}</strong>
          {' / '}売上 <strong className="font-bold">{report.committed.revenues}</strong>
          {' / '}仕入 <strong className="font-bold">{report.committed.purchases}</strong>
          {report.committed.dupSkipped ? ` / 重複で飛ばした ${report.committed.dupSkipped}` : ''}
          {report.committed.skipped ? ` / その他で飛ばした ${report.committed.skipped}` : ''}
          {' ｜ '}新しく作った：案件 {report.masters.created.projects}
          {' / '}顧客 {report.masters.created.customers} / 取引先 {report.masters.created.vendors}
        </p>
      )}

      {(report.masters.missingProjects.length > 0 || report.masters.missingCustomers.length > 0) && (
        <div className="rounded-control-lg border border-warning-border bg-warning-surface p-3">
          {report.masters.missingProjects.length > 0 && (
            <p className="text-note text-warning">
              登録の無い案件（GLS）{report.masters.missingProjects.length}件: {report.masters.missingProjects.join('、')}
            </p>
          )}
          {report.masters.missingCustomers.length > 0 && (
            <p className="text-note mt-1 text-warning">
              登録の無い顧客 {report.masters.missingCustomers.length}件: {report.masters.missingCustomers.slice(0, 20).join('、')}
            </p>
          )}
          {report.dryRun && (
            <p className="text-note mt-1 text-muted-foreground">
              「案件・顧客・取引先を自動で作る」を入れて取り込むと作られます。
            </p>
          )}
        </div>
      )}

      {dupTotal > 0 && (
        <div className="rounded-control-lg border border-destructive-border bg-destructive-surface p-3">
          <p className="text-note font-bold text-destructive">
            既にあるデータと同じ金額＋内容の重複候補が {dupTotal} 件あります
            （販管費 {report.duplicates.sga} / 売上 {report.duplicates.revenues} / 仕入 {report.duplicates.purchases}）
          </p>
          <p className="text-note mt-1 text-destructive">
            手で入れた分とこの取り込みが二重計上にならないか確かめてください（決算の取り込みどうしの入れ直しは対象外です）。
          </p>
          {report.duplicates.samples.length > 0 && (
            <ul className="font-number mt-1">
              {report.duplicates.samples.map((s) => <li key={s} className="text-note truncate">{s}</li>)}
            </ul>
          )}
        </div>
      )}

      {report.warnings.length > 0 && (
        <div className="rounded-control-lg border border-warning-border bg-warning-surface p-3">
          {report.warnings.map((w) => <p key={w} className="text-note text-warning">{w}</p>)}
        </div>
      )}

      <details className="text-note">
        <summary className="min-h-tap flex cursor-pointer items-center text-muted-foreground">明細のサンプルを出す</summary>
        <div className="mt-2 flex flex-col gap-3">
          {(['sga', 'revenues', 'purchases'] as const).map((k) => (report.samples[k].length ? (
            <div key={k}>
              <p className="font-bold">{k === 'sga' ? '販管費' : k === 'revenues' ? '売上' : '仕入'}</p>
              <ul className="font-number mt-1">
                {report.samples[k].map((s) => <li key={s} className="truncate">{s}</li>)}
              </ul>
            </div>
          ) : null))}
        </div>
      </details>
    </div>
  );
}
