/**
 * 精算 PDF の取込元（Box フォルダ ／ 直接アップロード） (⑦ 取り込み・v4)
 *
 * **「BOX に置く必要はありません」とは書かない。** 解析は Box の
 * extracted_text を読む一本道で、Box が設定されていないとサーバーが 400 を返します。
 * 直接アップロードも「Box に保存してから解析する」経路なので、
 * Box が落ちた日はどちらも動きません。それを画面に書いてあります。
 */
import { useRef, useState } from 'react';
import { Loader2, FolderSearch, ExternalLink, AlertTriangle, RotateCcw, Upload, CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PdfSources({
  folderInput, onFolderInput, onScan, scanning, scanError,
  scanned, fileCount, doneCount,
  uploading, uploadProgress, uploadErrors, uploadNotices, onFiles,
}: {
  folderInput: string;
  onFolderInput: (v: string) => void;
  onScan: () => void;
  scanning: boolean;
  scanError: string | null;
  scanned: { folderId: string; folderUrl: string } | null;
  fileCount: number;
  doneCount: number;
  uploading: boolean;
  uploadProgress: string | null;
  uploadErrors: string[];
  uploadNotices: string[];
  onFiles: (list: FileList | File[] | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {/* ── Box フォルダから読み込み ───────────────────────── */}
      <div className="rounded-card flex flex-col gap-3 border border-border bg-card p-4">
        <p className="text-cardtitle flex items-center gap-2">
          <FolderSearch className="h-4 w-4 text-primary" aria-hidden="true" />Box フォルダから読み込み
        </p>
        <div>
          <Label>取込元 Box フォルダ（ID または URL・空欄なら既定フォルダ）</Label>
          <Input
            value={folderInput}
            onChange={(e) => onFolderInput(e.target.value)}
            placeholder="例: 397127787652 / https://gmo-globalstudio.app.box.com/folder/…"
          />
        </div>
        <Button onClick={onScan} disabled={scanning} className="w-full">
          {scanning
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            : <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />}
          {scanned ? 'フォルダを再読み込み' : 'フォルダを読み込み'}
        </Button>
        {scanError && <p className="text-sub-sm text-destructive">読み込みに失敗しました: {scanError}</p>}
        {scanned && (
          <p className="text-note text-muted-foreground">
            フォルダ:{' '}
            <a
              href={scanned.folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline"
            >
              {scanned.folderId}<ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            {' ・ '}PDF {fileCount} 件（処理済み {doneCount} 件）
          </p>
        )}
      </div>

      {/* ── 直接アップロード ─────────────────────────────── */}
      <div className="rounded-card flex flex-col gap-3 border border-border bg-card p-4">
        <p className="text-cardtitle flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" aria-hidden="true" />PDF を直接アップロード
        </p>
        <div
          role="button"
          tabIndex={0}
          aria-label="PDF をドラッグ＆ドロップ、またはクリックして選択"
          className={`rounded-control-lg cursor-pointer border-2 border-dashed p-5 text-center transition-colors ${
            dragOver ? 'border-primary bg-primary-surface-weak' : 'border-border hover:border-primary'
          }`}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
        >
          {uploading ? (
            <div className="text-sub flex items-center justify-center gap-2 py-1 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {uploadProgress || 'アップロード中…'}
            </div>
          ) : (
            <>
              <CloudUpload className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sub mt-1.5 font-bold">ここに PDF をドラッグ＆ドロップ</p>
              <p className="text-note mt-0.5 text-muted-foreground">またはクリックして選択（複数可・PDF のみ）</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
        <p className="text-note text-muted-foreground">
          アップロードした PDF は <strong className="font-bold">Box の取込フォルダに保存されてから</strong>解析されます
          （読み取りに Box を使うので、Box が使えない日はどちらの取込元も動きません）。
        </p>
        {(uploadErrors.length > 0 || uploadNotices.length > 0) && (
          <div className="flex flex-col gap-0.5">
            {uploadNotices.map((n) => (
              <p key={n} className="text-note flex items-start gap-1 text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{n}
              </p>
            ))}
            {uploadErrors.map((e) => (
              <p key={e} className="text-note flex items-start gap-1 text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{e}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
