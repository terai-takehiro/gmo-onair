/**
 * 精算 PDF（X-Point / 楽楽精算）の取込タブ (⑦ 取り込み・v4)
 *
 * 旧 `XpointImportPage.tsx`（980行）の一覧部分。**解析・登録のロジックは
 * 1行も変えていません** — 枠の入れ替えと中身の作り直しを同じ回でやると、
 * どちらが原因で壊れたか切り分けられません（v4 の一貫した進め方）。
 *
 * 変えたのは ①`alert()` を消えないお知らせ帯に ②行を共通の `Row` 部品に
 * ③状態バッジを固定幅に ④生の Tailwind パレットをトークンに、の4点です。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, FileText, ScanSearch, CheckCircle2, RotateCcw, SkipForward } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { PdfSources } from './PdfSources';
import { PdfReviewDialog } from './PdfReviewDialog';
import { XPOINT_STATUS, settlementPrefix, type XpointFileRow, type XpointParseResult } from './types';

const errText = (err: unknown): string => {
  const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return e?.response?.data?.error?.message || e?.message || '';
};

export function PdfTab({ onStep }: { onStep: (n: 1 | 2 | 3) => void }) {
  const qc = useQueryClient();
  const [folderInput, setFolderInput] = useState('');
  const [scanned, setScanned] = useState<{ folderId: string; folderUrl: string; files: XpointFileRow[] } | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ file: XpointFileRow; result: XpointParseResult } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploadNotices, setUploadNotices] = useState<string[]>([]);

  const scan = useMutation({
    mutationFn: async () => {
      const params = folderInput.trim() ? `?folder=${encodeURIComponent(folderInput.trim())}` : '';
      return (await api.get(`/xpoint/files${params}`)).data.data;
    },
    onSuccess: (data) => setScanned(data),
    meta: { silent: true },
  });

  // 開いたら既定フォルダの一覧を出す（解析・登録は一切自動実行しない）
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    scan.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadFiles = useMutation({
    mutationFn: async (files: File[]) => {
      const errors: string[] = [];
      const notices: string[] = [];
      const parsedResults: { file: XpointFileRow; result: XpointParseResult }[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUploadProgress(`取込中 (${i + 1}/${files.length}): ${f.name} — Box への保存と解析に 1 分ほどかかることがあります`);
        try {
          const fd = new FormData();
          fd.append('file', f);
          if (folderInput.trim()) fd.append('folder', folderInput.trim());
          const data = (await api.post('/xpoint/upload', fd, {
            timeout: 180_000,
            headers: { 'Content-Type': 'multipart/form-data' },
          })).data.data;
          if (data.parse_pending) notices.push(data.parse_error);
          else if (data.parse_error) errors.push(`${f.name}: ${data.parse_error}`);
          else if (data.file && data.result) {
            parsedResults.push({ file: data.file as XpointFileRow, result: data.result as XpointParseResult });
          }
        } catch (err) {
          errors.push(`${f.name}: ${errText(err)}`);
        }
      }
      return { errors, notices, parsedResults };
    },
    onSuccess: ({ errors, notices, parsedResults }) => {
      setUploadProgress(null);
      setUploadErrors(errors);
      setUploadNotices(notices);
      scan.mutate();
      // 1件だけ上げて解析まで通ったら、そのままレビューを開く
      if (parsedResults.length === 1) setReviewTarget(parsedResults[0]);
    },
    onError: (err) => {
      setUploadProgress(null);
      setUploadErrors([errText(err)]);
      setUploadNotices([]);
      scan.mutate();
    },
    meta: { silent: true },
  });

  const handleFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const pdfs = Array.from(list).filter((f) => /\.pdf$/i.test(f.name));
    const rejected = Array.from(list).length - pdfs.length;
    setUploadErrors(rejected > 0 ? [`PDF 以外のファイル ${rejected} 件は無視しました`] : []);
    setUploadNotices([]);
    if (pdfs.length > 0) uploadFiles.mutate(pdfs);
  };

  const parse = useMutation({
    mutationFn: async (file: XpointFileRow) => {
      const res = (await api.post(`/xpoint/files/${file.box_file_id}/parse`, { file_name: file.file_name })).data.data as XpointParseResult;
      return { file, result: res };
    },
    onSuccess: ({ file, result }) => {
      setReviewTarget({ file, result });
      scan.mutate();
    },
    onError: (err) => { notifyApiError('PDF を読み取れませんでした', err); scan.mutate(); },
  });

  const skip = useMutation({
    mutationFn: async (file: XpointFileRow) => api.post(`/xpoint/files/${file.id}/skip`),
    onSuccess: () => scan.mutate(),
    meta: { action: '取込対象外にする' },
  });
  const reopen = useMutation({
    mutationFn: async (file: XpointFileRow) => api.post(`/xpoint/files/${file.id}/reopen`),
    onSuccess: () => scan.mutate(),
    meta: { action: '取込を再開する' },
  });

  const files = useMemo(() => scanned?.files ?? [], [scanned]);
  const open = files.filter((f) => f.status !== 'registered' && f.status !== 'skipped');
  const visibleFiles = showDone ? files : open;
  const doneCount = files.length - open.length;

  // **現在地は作り話にしない** — いま何段目かは行の状態から導く
  useEffect(() => {
    if (reviewTarget) onStep(3);
    else if (files.some((f) => f.status === 'parsed')) onStep(2);
    else onStep(1);
  }, [reviewTarget, files, onStep]);

  return (
    <div className="flex flex-col gap-4">
      <PdfSources
        folderInput={folderInput}
        onFolderInput={setFolderInput}
        onScan={() => scan.mutate()}
        scanning={scan.isPending}
        scanError={scan.isError ? errText(scan.error) : null}
        scanned={scanned}
        fileCount={files.length}
        doneCount={doneCount}
        uploading={uploadFiles.isPending}
        uploadProgress={uploadProgress}
        uploadErrors={uploadErrors}
        uploadNotices={uploadNotices}
        onFiles={handleFiles}
      />

      {!scanned && scan.isPending ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : scanned ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-cardtitle">
              取込ファイル
              <span className="text-note ml-2 text-muted-foreground">
                レビュー待ち {files.filter((f) => f.status === 'parsed').length}
                {' ・ '}未解析 {files.filter((f) => f.status === 'new').length}
                {' ・ '}登録済み {files.filter((f) => f.status === 'registered').length}
              </span>
            </h2>
            <Button variant="ghost" onClick={() => setShowDone((v) => !v)}>
              {showDone ? '処理済みを隠す' : '処理済み（登録済み・スキップ）も出す'}
            </Button>
          </div>

          {visibleFiles.length === 0 ? (
            <EmptyState
              title={files.length === 0 ? 'フォルダに PDF がありません' : '未処理の PDF はありません'}
              description="上の Box フォルダに PDF を置いて再読み込みするか、この画面に直接アップロードしてください。"
            />
          ) : (
            <div className="flex flex-col">
              <RowHeader className="hidden sm:flex">
                <RowMain>ファイル ／ 内容</RowMain>
                <RowSlot w={128} align="right">金額（税込）</RowSlot>
                <RowSlot w={96}>状態</RowSlot>
                <RowSlot w={200}>次にやること</RowSlot>
              </RowHeader>

              {visibleFiles.map((f) => {
                const st = XPOINT_STATUS[f.status];
                const pd = f.parsed_data;
                const subject = pd?.parsed?.subject ?? pd?.voucher?.items?.[0]?.usage ?? null;
                const totalInclusive = pd?.parsed?.amountInclusive ?? pd?.voucher?.totalInclusive ?? null;
                const payee = pd?.parsed?.vendorName ?? (pd?.voucher?.applicantName ? `${pd.voucher.applicantName}（立替）` : null);
                const regRecords = f.registered_records || [];
                return (
                  <Row key={f.box_file_id} align="start">
                    <RowMain>
                      <RowTitle>
                        <FileText className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        {f.file_name}
                      </RowTitle>
                      <RowSub>
                        {[
                          pd ? (pd.format === 'rakuraku' ? '楽楽精算' : 'X-Point') : null,
                          f.xp_number ? `${settlementPrefix(f.format)}-${f.xp_number}` : null,
                          f.kind === 'purchase' ? '仕入' : f.kind === 'sga' ? '販管費' : null,
                          pd && pd.units.length > 1 ? `${pd.units.length} 単位に分けて登録` : null,
                          subject, payee,
                        ].filter(Boolean).join(' ・ ')}
                      </RowSub>
                      {f.status === 'error' && f.error_message && (
                        <p className="text-note mt-1 text-destructive">{f.error_message}</p>
                      )}
                      {regRecords.length > 0 && (
                        <p className="text-note mt-1 flex flex-wrap gap-2 text-success">
                          {regRecords.map((r, i) => (
                            <Link
                              key={`${r.table}-${r.id}`}
                              className="underline"
                              to={r.table === 'purchases' ? `/budget/purchases?edit=${r.id}` : `/budget/sga?edit=${r.id}`}
                            >
                              登録{regRecords.length > 1 ? ` ${i + 1}` : ''}
                              （{r.kind === 'purchase' ? '仕入' : '販管費'} {formatCurrency(r.amount)}）
                            </Link>
                          ))}
                        </p>
                      )}
                    </RowMain>

                    <MoneyCell value={totalInclusive ?? 0} width={128} />

                    <RowSlot w={96}>
                      <TableBadge label={st.label} w={null} className={`w-full ${st.tone}`} />
                    </RowSlot>

                    <RowSlot w={200}>
                      <span className="flex flex-wrap gap-1">
                        {(f.status === 'new' || f.status === 'error') && (
                          <Button onClick={() => parse.mutate(f)} disabled={parse.isPending}>
                            {parse.isPending && parse.variables?.box_file_id === f.box_file_id
                              ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                              : <ScanSearch className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
                            読み取る
                          </Button>
                        )}
                        {f.status === 'parsed' && f.parsed_data && (
                          <>
                            <Button onClick={() => setReviewTarget({ file: f, result: f.parsed_data! })}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />確認する
                            </Button>
                            <Button
                              variant="outline"
                              aria-label="PDF を読み取り直す"
                              onClick={() => parse.mutate(f)}
                              disabled={parse.isPending}
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </>
                        )}
                        {f.status === 'skipped' && (
                          <Button variant="outline" onClick={() => reopen.mutate(f)}>
                            <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />再開
                          </Button>
                        )}
                        {(f.status === 'new' || f.status === 'parsed' || f.status === 'error') && (
                          <Button variant="ghost" aria-label="取込対象外にする" onClick={() => skip.mutate(f)}>
                            <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </span>
                    </RowSlot>
                  </Row>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {reviewTarget && (
        <PdfReviewDialog
          file={reviewTarget.file}
          result={reviewTarget.result}
          onClose={() => { setReviewTarget(null); scan.mutate(); }}
          onRegistered={() => {
            setReviewTarget(null);
            scan.mutate();
            qc.invalidateQueries({ queryKey: ['purchases-all'] });
            qc.invalidateQueries({ queryKey: ['sga-list'] });
          }}
        />
      )}
    </div>
  );
}
