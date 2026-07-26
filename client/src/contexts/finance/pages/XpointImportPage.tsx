/**
 * XpointImportPage — 精算申請 PDF 取込 (X-Point / 楽楽精算)
 *
 * Box の監視フォルダから X-Point (OBIC 経費申請書) / 楽楽精算 (経費精算 伝票) の PDF を
 * 読み込み (手動ボタン)、解析結果を仕入/販管費の登録画面と同等のフォームで
 * レビュー・修正してから登録する。
 * 楽楽精算は 1 伝票に税区分の異なる複数明細が含まれ得るため、
 * (種別 × GLS × 税区分) の「登録単位」に分解して 1 単位ずつ確認・登録する。
 * 自動登録は行わず、すべての項目が人間の目のチェックを通ってから確定される。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Vendor, TaxCategoryLabels } from "@/types";
import {
  Loader2, FolderSearch, ExternalLink, FileText, AlertTriangle, CheckCircle2,
  RotateCcw, SkipForward, ScanSearch, Check, Upload, CloudUpload, PenLine,
} from "lucide-react";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";
import { notifyError } from '@/lib/notify';

// ---- サーバーの解析結果に対応する型 (表示に使う分のみ) ----
interface XpointParsed {
  xpNumber: string | null;
  kind: "purchase" | "sga" | "unknown";
  subject: string | null;
  glsNumber: string | null;
  vendorCode: string | null;
  vendorName: string | null;
  amountInclusive: number | null;
  paymentMethod: string | null;
  invoiceNumber: string | null;
  invoiceQualified: boolean;
  applicationDate: string | null;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
  paymentDueDate: string | null;
  recognitionDate: string | null;
  description: string | null;
  detailLines: string[];
  account: string | null;
  applicantName: string | null;
  warnings: string[];
}

interface RakurakuItem {
  no: number;
  date: string | null;
  taxLabel: string;
  taxCategory: string;
  body: string;
  amountInclusive: number;
  usage: string | null;
  kind: "purchase" | "sga" | "unknown";
  glsNumber: string | null;
  description: string | null;
}

interface RakurakuParsed {
  denpyoNumber: string | null;
  headerNumber: string | null;
  applicantName: string | null;
  applicationDate: string | null;
  totalInclusive: number | null;
  items: RakurakuItem[];
  warnings: string[];
}

interface RegistrationUnit {
  kind: "purchase" | "sga" | "unknown";
  glsNumber: string | null;
  taxCategory: "tax10" | "tax8" | "exempt";
  amountInclusive: number;
  amountExclusive: number;
  description: string | null;
  recognitionDate: string | null;
  itemNos: number[];
  project: { id: string; name: string; gls_number: string } | null;
}

interface VendorMatch { id: string; name: string; matched_by: string }
interface DuplicateRow { id: string; amount: number; recognition_date: string | null; vendor_name: string | null; description: string | null }

interface XpointParseResult {
  format: "xpoint" | "rakuraku";
  settlementMethod: "xpoint" | "rakuraku";
  settlementNumber: string | null;
  parsed: XpointParsed | null;
  voucher: RakurakuParsed | null;
  units: RegistrationUnit[];
  warnings: string[];
  match: { vendor: VendorMatch | null; vendorCandidates: VendorMatch[] };
  duplicates: { purchases: DuplicateRow[]; sga: DuplicateRow[] };
  parsedAt: string;
}

interface RegisteredRecord {
  table: string;
  id: string;
  kind: string;
  unit_index: number | null;
  amount: number;
  at: string;
}

interface XpointFileRow {
  id: number;
  box_file_id: string;
  file_name: string;
  box_modified_at: string | null;
  xp_number: string | null;
  kind: string;
  format: "xpoint" | "rakuraku" | "unknown";
  status: "new" | "parsed" | "registered" | "skipped" | "error";
  parsed_data: XpointParseResult | null;
  error_message: string | null;
  registered_table: string | null;
  registered_id: string | null;
  registered_records: RegisteredRecord[] | null;
}

interface ProjectOption { id: string; gls_number: string; name: string }

const STATUS_BADGE: Record<XpointFileRow["status"], { label: string; cls: string }> = {
  new: { label: "未解析", cls: "bg-slate-100 text-slate-700" },
  parsed: { label: "レビュー待ち", cls: "bg-blue-100 text-blue-700" },
  registered: { label: "登録済み", cls: "bg-green-100 text-green-700" },
  skipped: { label: "スキップ", cls: "bg-yellow-100 text-yellow-700" },
  error: { label: "エラー", cls: "bg-red-100 text-red-700" },
};

function taxRate(cat: string): number {
  return cat === "tax10" ? 1.1 : cat === "tax8" ? 1.08 : 1;
}

function settlementPrefix(format: string): string {
  return format === "rakuraku" ? "楽" : "X";
}

export default function XpointImportPage({ embedded }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [folderInput, setFolderInput] = useState("");
  const [scanned, setScanned] = useState<{ folderId: string; folderUrl: string; files: XpointFileRow[] } | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ file: XpointFileRow; result: XpointParseResult } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploadNotices, setUploadNotices] = useState<string[]>([]);

  const scan = useMutation({
    mutationFn: async () => {
      const params = folderInput.trim() ? `?folder=${encodeURIComponent(folderInput.trim())}` : "";
      return (await api.get(`/xpoint/files${params}`)).data.data;
    },
    onSuccess: (data) => setScanned(data),
  });

  // ページを開いたら既定フォルダの一覧を自動表示 (解析・登録は一切自動実行しない)
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    scan.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PDF を直接アップロード → Box 監視フォルダに保存 → 解析まで実行
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
          fd.append("file", f);
          if (folderInput.trim()) fd.append("folder", folderInput.trim());
          const data = (await api.post("/xpoint/upload", fd, {
            timeout: 180_000,
            headers: { "Content-Type": "multipart/form-data" },
          })).data.data;
          if (data.parse_pending) {
            notices.push(data.parse_error);
          } else if (data.parse_error) {
            errors.push(`${f.name}: ${data.parse_error}`);
          } else if (data.file && data.result) {
            parsedResults.push({ file: data.file as XpointFileRow, result: data.result as XpointParseResult });
          }
        } catch (err: any) {
          errors.push(`${f.name}: ${err?.response?.data?.error?.message || err.message}`);
        }
      }
      return { errors, notices, parsedResults };
    },
    onSuccess: ({ errors, notices, parsedResults }) => {
      setUploadProgress(null);
      setUploadErrors(errors);
      setUploadNotices(notices);
      scan.mutate();
      // 1 件だけアップロードして解析成功したら、そのままレビューを開いて次の操作へ誘導
      if (parsedResults.length === 1) setReviewTarget(parsedResults[0]);
    },
    onError: (err: any) => {
      setUploadProgress(null);
      setUploadErrors([err?.response?.data?.error?.message || err.message]);
      setUploadNotices([]);
      scan.mutate();
    },
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
      scan.mutate(); // 一覧のステータスを更新
    },
    onError: (err: any) => {
      notifyError(`PDF の解析に失敗しました: ${err?.response?.data?.error?.message || err.message}`);
      scan.mutate();
    },
  });

  const skip = useMutation({
    mutationFn: async (file: XpointFileRow) => api.post(`/xpoint/files/${file.id}/skip`),
    onSuccess: () => scan.mutate(),
  });
  const reopen = useMutation({
    mutationFn: async (file: XpointFileRow) => api.post(`/xpoint/files/${file.id}/reopen`),
    onSuccess: () => scan.mutate(),
  });

  const files = scanned?.files ?? [];
  const visibleFiles = showDone ? files : files.filter((f) => f.status !== "registered" && f.status !== "skipped");
  const doneCount = files.length - files.filter((f) => f.status !== "registered" && f.status !== "skipped").length;

  return (
    <PageTransition>
      <div className={embedded ? "space-y-4 lg:space-y-6" : "space-y-4 lg:space-y-6 p-3 lg:p-6 mx-auto max-w-screen-xl"}>
        <div className={embedded ? "hidden" : undefined}>
          <PageTitle>精算 PDF 取込 (X-Point / 楽楽精算)</PageTitle>
          <p className="text-sm text-muted-foreground mt-1">
            X-Point / 楽楽精算の申請 PDF を読み込み、内容を確認・修正してから仕入 / 販管費に登録します。
            自動では登録されません — <span className="font-medium text-foreground">すべての項目を必ず確認してください</span>。
          </p>
        </div>

        {/* 使い方 3 ステップ (枠に出すので埋め込み時は隠す) */}
        <div className={embedded ? "hidden" : "rounded-xl border bg-card p-3 sm:p-4"}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            {[
              { icon: CloudUpload, title: "1. PDF を取り込む", desc: "Box フォルダに置いて読み込むか、この画面に直接アップロード" },
              { icon: ScanSearch, title: "2. 解析してレビュー", desc: "「解析してレビュー」を押すと内容を自動で読み取ります" },
              { icon: PenLine, title: "3. 確認・修正して登録", desc: "全項目を目でチェックし、必要なら直して仕入/販管費に登録" },
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="rounded-lg bg-primary/10 text-primary p-2 shrink-0"><s.icon className="h-4 w-4" /></div>
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 取込元: Box フォルダ / 直接アップロード */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Box フォルダ */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <FolderSearch className="h-4 w-4 text-primary" />Box フォルダから読み込み
            </p>
            <div className="space-y-1">
              <Label className="text-xs">取込元 Box フォルダ (ID または URL・空欄なら既定フォルダ)</Label>
              <Input
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="例: 397127787652 / https://gmo-globalstudio.app.box.com/folder/…"
              />
            </div>
            <Button onClick={() => scan.mutate()} disabled={scan.isPending} className="w-full">
              {scan.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              {scanned ? "フォルダを再読み込み" : "フォルダを読み込み"}
            </Button>
            {scan.isError && (
              <p className="text-sm text-red-600">
                読み込みに失敗しました: {(scan.error as any)?.response?.data?.error?.message || (scan.error as Error).message}
              </p>
            )}
            {scanned && (
              <p className="text-xs text-muted-foreground">
                フォルダ: <a href={scanned.folderUrl} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">{scanned.folderId}<ExternalLink className="h-3 w-3" /></a>
                {" ・ "}PDF {files.length} 件 (処理済み {doneCount} 件)
              </p>
            )}
          </div>

          {/* 直接アップロード */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />PDF を直接アップロード
            </p>
            <div
              className={`rounded-lg border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            >
              {uploadFiles.isPending ? (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-1">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {uploadProgress || "アップロード中…"}
                </div>
              ) : (
                <>
                  <CloudUpload className="h-6 w-6 mx-auto text-muted-foreground" />
                  <p className="text-sm mt-1.5 font-medium">ここに PDF をドラッグ＆ドロップ</p>
                  <p className="text-xs text-muted-foreground mt-0.5">またはクリックしてファイルを選択 (複数可・PDF のみ)</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              アップロードした PDF は Box の取込フォルダに保存され、そのまま解析されてレビュー画面が開きます。
            </p>
            {(uploadErrors.length > 0 || uploadNotices.length > 0) && (
              <div className="space-y-0.5">
                {uploadNotices.map((n, i) => (
                  <p key={`n-${i}`} className="text-xs text-amber-700 flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{n}</p>
                ))}
                {uploadErrors.map((e, i) => (
                  <p key={`e-${i}`} className="text-xs text-red-600 flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{e}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ファイル一覧 */}
        {scanned && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                取込ファイル一覧
                <span className="ml-2 font-normal text-xs text-muted-foreground">
                  レビュー待ち {files.filter((f) => f.status === "parsed").length} ・ 未解析 {files.filter((f) => f.status === "new").length} ・ 登録済み {files.filter((f) => f.status === "registered").length}
                </span>
              </h2>
              <button className="text-xs underline text-muted-foreground" onClick={() => setShowDone((v) => !v)}>
                {showDone ? "処理済み (登録済み・スキップ) を隠す" : "処理済み (登録済み・スキップ) も表示"}
              </button>
            </div>
            {visibleFiles.length === 0 && (
              <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
                {files.length === 0
                  ? "フォルダに PDF がありません。上の Box フォルダに PDF を置いて再読み込みするか、直接アップロードしてください。"
                  : "未処理の PDF はありません。新しい PDF を Box フォルダに置いて再読み込みするか、直接アップロードしてください。"}
              </div>
            )}
            {visibleFiles.map((f) => {
              const badge = STATUS_BADGE[f.status];
              const pd = f.parsed_data;
              const subject = pd?.parsed?.subject ?? pd?.voucher?.items?.[0]?.usage ?? null;
              const totalInclusive = pd?.parsed?.amountInclusive ?? pd?.voucher?.totalInclusive ?? null;
              const payeeName = pd?.parsed?.vendorName ?? (pd?.voucher?.applicantName ? `${pd.voucher.applicantName} (立替)` : null);
              const regRecords = f.registered_records || [];
              return (
                <div key={f.box_file_id} className="rounded-xl border bg-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">{f.file_name}</span>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                      {pd && (
                        <Badge variant="outline" className="text-xs">
                          {pd.format === "rakuraku" ? "楽楽精算" : "X-Point"}
                        </Badge>
                      )}
                      {f.xp_number && <Badge variant="outline" className="text-xs">{settlementPrefix(f.format)}-{f.xp_number}</Badge>}
                      {f.kind === "purchase" && <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 text-xs">仕入</Badge>}
                      {f.kind === "sga" && <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-xs">販管費</Badge>}
                      {pd && pd.units.length > 1 && (
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs">{pd.units.length} 単位</Badge>
                      )}
                    </div>
                    {pd && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {subject}
                        {payeeName ? ` ／ ${payeeName}` : ""}
                        {totalInclusive != null ? ` ／ 税込 ${formatCurrency(totalInclusive)}` : ""}
                      </p>
                    )}
                    {f.status === "error" && f.error_message && (
                      <p className="text-xs text-red-600 mt-1">{f.error_message}</p>
                    )}
                    {regRecords.length > 0 && (
                      <p className="text-xs text-green-700 mt-1 flex flex-wrap gap-2">
                        {regRecords.map((r, i) => (
                          <Link
                            key={`${r.table}-${r.id}`}
                            className="underline"
                            to={r.table === "purchases" ? `/budget/purchases?edit=${r.id}` : `/budget/sga?edit=${r.id}`}
                          >
                            登録{regRecords.length > 1 ? ` ${i + 1}` : ""} ({r.kind === "purchase" ? "仕入" : "販管費"} {formatCurrency(r.amount)})
                          </Link>
                        ))}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(f.status === "new" || f.status === "error") && (
                      <Button size="sm" onClick={() => parse.mutate(f)} disabled={parse.isPending}>
                        {parse.isPending && parse.variables?.box_file_id === f.box_file_id
                          ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          : <ScanSearch className="h-4 w-4 mr-1" />}
                        解析してレビュー
                      </Button>
                    )}
                    {f.status === "parsed" && f.parsed_data && (
                      <>
                        <Button size="sm" onClick={() => setReviewTarget({ file: f, result: f.parsed_data! })}>
                          <CheckCircle2 className="h-4 w-4 mr-1" />レビュー
                        </Button>
                        <Button size="sm" variant="outline" title="PDF を再解析" onClick={() => parse.mutate(f)} disabled={parse.isPending}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {f.status === "skipped" && (
                      <Button size="sm" variant="outline" onClick={() => reopen.mutate(f)}>
                        <RotateCcw className="h-4 w-4 mr-1" />再開
                      </Button>
                    )}
                    {(f.status === "new" || f.status === "parsed" || f.status === "error") && (
                      <Button size="sm" variant="ghost" title="取込対象外にする" onClick={() => skip.mutate(f)}>
                        <SkipForward className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!scanned && scan.isPending && (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />Box フォルダを読み込んでいます…
          </div>
        )}

        {reviewTarget && (
          <XpointReviewDialog
            file={reviewTarget.file}
            result={reviewTarget.result}
            onClose={() => {
              setReviewTarget(null);
              scan.mutate(); // 部分登録の状態を一覧へ反映
            }}
            onRegistered={() => {
              setReviewTarget(null);
              scan.mutate();
              queryClient.invalidateQueries({ queryKey: ["purchases-all"] });
              queryClient.invalidateQueries({ queryKey: ["sga-list"] });
            }}
          />
        )}
      </div>
    </PageTransition>
  );
}

// ============================================================
// レビューダイアログ — 登録単位 (1 単位 = 仕入/販管費 1 レコード) ごとに
// 人間がチェック・修正して登録する。楽楽精算は複数単位をステップで処理。
// ============================================================
function XpointReviewDialog({
  file, result, onClose, onRegistered,
}: {
  file: XpointFileRow;
  result: XpointParseResult;
  onClose: () => void;
  onRegistered: () => void;
}) {
  const p = result.parsed;
  const v = result.voucher;
  const units = result.units;
  const isRakuraku = result.format === "rakuraku";

  // 登録済み単位 (再オープン時に registered_records から復元)
  const [registeredUnits, setRegisteredUnits] = useState<Set<number>>(() => {
    const s = new Set<number>();
    for (const r of file.registered_records || []) {
      if (typeof r.unit_index === "number") s.add(r.unit_index);
    }
    return s;
  });
  const firstOpen = units.findIndex((_, i) => !new Set((file.registered_records || []).map((r) => r.unit_index)).has(i));
  const [unitIdx, setUnitIdx] = useState(firstOpen >= 0 ? firstOpen : 0);
  const unit = units[unitIdx];

  // ---- 共通フィールド (伝票単位で共有) ----
  const [settlementNumber, setSettlementNumber] = useState(result.settlementNumber || "");
  const [invoiceQualified, setInvoiceQualified] = useState(p ? (p.invoiceQualified ? "qualified" : "unqualified") : "qualified");
  const [paymentDueDate, setPaymentDueDate] = useState(p?.paymentDueDate || "");

  // ---- 単位ごとのフィールド ----
  const [kind, setKind] = useState<"purchase" | "sga">("purchase");
  const [taxCategory, setTaxCategory] = useState<string>("tax10");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState("");
  const [vendorId, setVendorId] = useState(result.match.vendor?.id || "");
  const [createVendor, setCreateVendor] = useState(false);
  const [recognitionMonth, setRecognitionMonth] = useState("");
  const [serviceCompletedDate, setServiceCompletedDate] = useState("");
  const [isProvisional, setIsProvisional] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [recognitionDate, setRecognitionDate] = useState("");

  // 単位が切り替わったら、その単位の抽出値でフォームを再プリフィル
  useEffect(() => {
    if (!unit) return;
    setKind(unit.kind === "sga" ? "sga" : "purchase");
    setTaxCategory(unit.taxCategory);
    setAmount(unit.amountExclusive);
    setProjectId(unit.project?.id || "");
    setRecognitionMonth(unit.recognitionDate ? unit.recognitionDate.slice(0, 7) : "");
    setRecognitionDate(unit.recognitionDate || "");
    setDescription(unit.description || p?.description || p?.subject || "");
    if (isRakuraku && v) {
      setServiceCompletedDate(unit.recognitionDate || "");
      setVendorName(v.applicantName ? `${v.applicantName}（立替精算）` : "");
      const unitItems = v.items.filter((it) => unit.itemNos.includes(it.no));
      setNotes(
        [
          `[楽楽精算取込] ${file.file_name} / 伝票No.${v.denpyoNumber || "?"} / 申請者: ${v.applicantName || "?"}`,
          ...unitItems.map((it) => `No.${it.no} ${it.date || ""} ${it.usage || it.body} ${formatCurrency(it.amountInclusive)}(税込)`),
        ].join("\n")
      );
    } else {
      setServiceCompletedDate(p?.servicePeriodEnd || "");
      setVendorName(p?.vendorName || "");
      setNotes(
        [`[X-Point取込] ${file.file_name}`, p?.subject, p?.account, ...(p?.detailLines || [])].filter(Boolean).join("\n")
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitIdx]);

  const { data: glsProjectsData } = useQuery({
    queryKey: ["gls-projects-for-purchase"],
    queryFn: async () => (await api.get("/projects/gls-projects")).data,
  });
  const glsProjects: ProjectOption[] = glsProjectsData?.data ?? [];

  const { data: vendorsData } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => (await api.get("/vendors?limit=200")).data,
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];

  const register = useMutation({
    mutationFn: async () => {
      const willComplete = registeredUnits.size + 1 >= units.length;
      const common = {
        tax_category: taxCategory,
        settlement_method: result.settlementMethod,
        settlement_number: settlementNumber || null,
        invoice_qualified: invoiceQualified === "qualified" ? 1 : 0,
        amount,
        description: description || null,
        notes: notes || null,
        payment_due_date: paymentDueDate || null,
      };
      const newVendor = createVendor && !vendorId && p?.vendorName
        ? { name: p.vendorName, invoice_registration_number: p.invoiceNumber || null }
        : undefined;
      const body =
        kind === "purchase"
          ? {
              kind, unit_index: unitIdx, complete: willComplete, new_vendor: newVendor,
              purchase: {
                ...common,
                project_id: projectId,
                vendor_id: vendorId || null,
                recognition_date: recognitionMonth ? `${recognitionMonth}-01` : null,
                service_completed_date: serviceCompletedDate || null,
                is_provisional: isProvisional,
              },
            }
          : {
              kind, unit_index: unitIdx, complete: willComplete, new_vendor: newVendor,
              sga: {
                ...common,
                vendor_name: vendorName || null,
                vendor_id: vendorId || null,
                recognition_date: recognitionDate,
                expense_type: "spot",
              },
            };
      await api.post(`/xpoint/files/${file.id}/register`, body);
      return { willComplete };
    },
    onSuccess: ({ willComplete }) => {
      if (willComplete) {
        onRegistered();
        return;
      }
      setRegisteredUnits((prev) => {
        const next = new Set(prev);
        next.add(unitIdx);
        // 次の未登録単位へ進む
        const nextIdx = units.findIndex((_, i) => !next.has(i));
        if (nextIdx >= 0) setUnitIdx(nextIdx);
        return next;
      });
    },
    onError: (err: any) => {
      notifyError(`登録に失敗しました: ${err?.response?.data?.error?.message || err.message}`);
    },
  });

  const dupList = kind === "purchase" ? result.duplicates.purchases : result.duplicates.sga;
  const allDup = [...result.duplicates.purchases, ...result.duplicates.sga];

  const recalcFromInclusive = (cat: string) => {
    if (unit) setAmount(Math.round(unit.amountInclusive / taxRate(cat)));
  };

  const canSubmit = useMemo(() => {
    if (amount <= 0) return false;
    if (registeredUnits.has(unitIdx)) return false;
    if (kind === "purchase") return !!projectId && (!!vendorId || (createVendor && !!p?.vendorName));
    return !!recognitionDate && !!vendorName;
  }, [amount, kind, projectId, vendorId, createVendor, p?.vendorName, recognitionDate, vendorName, registeredUnits, unitIdx]);

  const vendorOptions = vendors.map((vd) => ({ value: vd.id, label: vd.name }));
  const projectOptions = glsProjects.map((pr) => ({ value: pr.id, label: `${pr.gls_number} ${pr.name}` }));
  const prefix = settlementPrefix(result.format);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {isRakuraku ? "楽楽精算の内容確認" : "X-Point 申請の内容確認"}
            {result.settlementNumber && <Badge variant="outline">{prefix}-{result.settlementNumber}</Badge>}
            <span className="text-xs font-normal text-muted-foreground">{file.file_name}</span>
          </DialogTitle>
        </DialogHeader>

        {/* 抽出結果 (参照用・読み取り専用) */}
        {p && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">PDF から抽出した内容 (参照用)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              <div><span className="text-muted-foreground">件名: </span>{p.subject || "—"}</div>
              <div><span className="text-muted-foreground">取引先: </span>{p.vendorCode ? `${p.vendorCode} ` : ""}{p.vendorName || "—"}</div>
              <div><span className="text-muted-foreground">支払金額 (税込): </span>{p.amountInclusive != null ? formatCurrency(p.amountInclusive) : "—"}{p.paymentMethod ? ` (${p.paymentMethod})` : ""}</div>
              <div><span className="text-muted-foreground">科目: </span>{p.account || "—"}</div>
              <div><span className="text-muted-foreground">申請日: </span>{p.applicationDate || "—"}{p.applicantName ? ` (${p.applicantName})` : ""}</div>
              <div><span className="text-muted-foreground">納期/期間: </span>{p.servicePeriodStart || "—"} 〜 {p.servicePeriodEnd || "—"}</div>
              <div><span className="text-muted-foreground">支払予定日: </span>{p.paymentDueDate || "—"}</div>
              <div><span className="text-muted-foreground">計上日 (経理欄): </span>{p.recognitionDate || "—"}</div>
              <div><span className="text-muted-foreground">適格事業者番号: </span>{p.invoiceNumber || "—"}</div>
              <div><span className="text-muted-foreground">GLS 番号: </span>{p.glsNumber || "—"}</div>
            </div>
          </div>
        )}
        {v && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">PDF から抽出した内容 (参照用)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              <div><span className="text-muted-foreground">伝票No: </span>{v.denpyoNumber || "—"}{v.headerNumber ? ` (管理番号 ${v.headerNumber})` : ""}</div>
              <div><span className="text-muted-foreground">申請者: </span>{v.applicantName || "—"}{v.applicationDate ? ` (申請日 ${v.applicationDate})` : ""}</div>
              <div><span className="text-muted-foreground">合計 精算額 (税込): </span>{v.totalInclusive != null ? formatCurrency(v.totalInclusive) : "—"}</div>
              <div><span className="text-muted-foreground">明細数: </span>{v.items.length} 行 → {units.length} 登録単位</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="pr-2 py-0.5 font-medium">No</th>
                    <th className="pr-2 py-0.5 font-medium">日付</th>
                    <th className="pr-2 py-0.5 font-medium">税区分</th>
                    <th className="pr-2 py-0.5 font-medium text-right">金額(税込)</th>
                    <th className="py-0.5 font-medium">用途</th>
                  </tr>
                </thead>
                <tbody>
                  {v.items.map((it) => (
                    <tr key={it.no} className="border-t border-border/50">
                      <td className="pr-2 py-0.5">{it.no}</td>
                      <td className="pr-2 py-0.5 whitespace-nowrap">{it.date || "—"}</td>
                      <td className="pr-2 py-0.5 whitespace-nowrap">{it.taxLabel}</td>
                      <td className="pr-2 py-0.5 text-right whitespace-nowrap">{formatCurrency(it.amountInclusive)}</td>
                      <td className="py-0.5">{it.usage || it.body}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 警告 */}
        {(result.warnings.length > 0 || allDup.length > 0) && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1">
            {allDup.length > 0 && (
              <p className="text-xs font-semibold text-red-700 flex items-start gap-1">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                精算番号 {prefix}-{result.settlementNumber} は既に {result.duplicates.purchases.length > 0 ? `仕入 ${result.duplicates.purchases.length} 件` : ""}
                {result.duplicates.purchases.length > 0 && result.duplicates.sga.length > 0 ? "・" : ""}
                {result.duplicates.sga.length > 0 ? `販管費 ${result.duplicates.sga.length} 件` : ""}
                に登録されています。二重登録に注意してください。
              </p>
            )}
            {dupList.map((d) => (
              <p key={d.id} className="text-xs text-red-700 pl-5">
                既存: {d.vendor_name || "—"} / {formatCurrency(d.amount)} / 計上 {d.recognition_date || "—"} / {d.description || ""}
              </p>
            ))}
            {result.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-800 flex items-start gap-1">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{w}
              </p>
            ))}
          </div>
        )}

        {/* 登録単位のステップ (楽楽精算で複数単位のとき) */}
        {units.length > 1 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">
              登録単位 (税区分・案件ごとに {units.length} 件に分けて登録します)
            </p>
            <div className="flex flex-wrap gap-2">
              {units.map((u, i) => {
                const done = registeredUnits.has(i);
                return (
                  <button
                    key={i}
                    className={`rounded-lg border px-3 py-1.5 text-xs text-left ${
                      i === unitIdx ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "bg-card"
                    } ${done ? "opacity-70" : ""}`}
                    onClick={() => setUnitIdx(i)}
                  >
                    <span className="font-medium flex items-center gap-1">
                      {done && <Check className="h-3 w-3 text-green-600" />}
                      単位 {i + 1}: {u.kind === "sga" ? "販管費" : "仕入"} / {TaxCategoryLabels[u.taxCategory as keyof typeof TaxCategoryLabels] || u.taxCategory}
                    </span>
                    <span className="text-muted-foreground">
                      {u.glsNumber || "GLS なし"} ・ 税込 {formatCurrency(u.amountInclusive)} → 税抜 {formatCurrency(u.amountExclusive)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 種別切替 */}
        <div className="flex gap-2">
          <Button
            variant={kind === "purchase" ? "default" : "outline"}
            size="sm"
            onClick={() => setKind("purchase")}
          >
            仕入として登録
          </Button>
          <Button
            variant={kind === "sga" ? "default" : "outline"}
            size="sm"
            onClick={() => setKind("sga")}
          >
            販管費として登録
          </Button>
          {unit?.kind === "unknown" && (
            <span className="text-xs text-amber-700 self-center">種別を判定できませんでした。選択してください。</span>
          )}
        </div>

        {/* 編集フォーム */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {kind === "purchase" ? (
            <>
              <div className="space-y-1 sm:col-span-2">
                <Label>案件 *</Label>
                <SearchableSelect
                  options={projectOptions}
                  value={projectId}
                  onChange={setProjectId}
                  placeholder="GLS番号・案件名で検索"
                />
                {!unit?.project && unit?.glsNumber && (
                  <p className="text-xs text-amber-700">GLS 番号 {unit.glsNumber} に一致する案件が見つかりませんでした。手動で選択してください。</p>
                )}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>仕入先 *</Label>
                <SearchableSelect
                  options={vendorOptions}
                  value={vendorId}
                  onChange={(val) => { setVendorId(val); if (val) setCreateVendor(false); }}
                  placeholder="仕入先を検索"
                />
                {result.match.vendor && (
                  <p className="text-xs text-green-700">
                    「{result.match.vendor.name}」に自動一致 ({result.match.vendor.matched_by === "invoice_number" ? "適格事業者番号" : "名称"})
                  </p>
                )}
                {!result.match.vendor && result.match.vendorCandidates.length > 0 && (
                  <p className="text-xs text-amber-700">
                    候補: {result.match.vendorCandidates.map((c) => c.name).join(" / ")} — 上の検索から選択してください
                  </p>
                )}
                {isRakuraku && (
                  <p className="text-xs text-muted-foreground">楽楽精算は従業員立替のため、立替経費用の仕入先を選択してください。</p>
                )}
                {!vendorId && p?.vendorName && (
                  <label className="flex items-center gap-2 text-xs mt-1 cursor-pointer">
                    <input type="checkbox" checked={createVendor} onChange={(e) => setCreateVendor(e.target.checked)} />
                    仕入先「{p.vendorName}」を新規作成して登録する
                  </label>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label>支払先 *</Label>
                <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>発生日 (計上日) *</Label>
                <Input type="date" value={recognitionDate} onChange={(e) => setRecognitionDate(e.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label>税区分</Label>
            <Select
              value={taxCategory}
              onValueChange={(val) => { setTaxCategory(val); recalcFromInclusive(val); }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TaxCategoryLabels).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isRakuraku ? "明細の税区分から自動判定済み。" : "X-Point の金額は税込表記のため 10% を仮定。"}
              変更するとこの単位の税込 {unit ? formatCurrency(unit.amountInclusive) : "—"} から税抜金額を再計算します
            </p>
          </div>
          <div className="space-y-1">
            <Label>金額 (税抜) *</Label>
            <CurrencyInput value={amount} onChange={setAmount} />
            {unit && (
              <p className="text-xs text-muted-foreground">
                税込 {formatCurrency(unit.amountInclusive)} ÷ {taxCategory === "tax10" ? "1.1" : taxCategory === "tax8" ? "1.08" : "1"} = {formatCurrency(Math.round(unit.amountInclusive / taxRate(taxCategory)))}
              </p>
            )}
          </div>

          {kind === "purchase" ? (
            <>
              <div className="space-y-1">
                <Label>計上月</Label>
                <Input type="month" value={recognitionMonth} onChange={(e) => setRecognitionMonth(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>役務提供完了日</Label>
                <Input type="date" value={serviceCompletedDate} onChange={(e) => setServiceCompletedDate(e.target.value)} />
              </div>
            </>
          ) : null}

          <div className="space-y-1">
            <Label>支払予定日</Label>
            <Input type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>精算番号 ({isRakuraku ? "楽楽精算" : "X-Point"})</Label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">{prefix}-</span>
              <Input value={settlementNumber} onChange={(e) => setSettlementNumber(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>インボイス</Label>
            <Select value={invoiceQualified} onValueChange={setInvoiceQualified}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="qualified">適格事業者</SelectItem>
                <SelectItem value="unqualified">非適格</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {kind === "purchase" && (
            <div className="space-y-1 flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={isProvisional} onCheckedChange={setIsProvisional} />
                仮 (見込み仕入)
              </label>
            </div>
          )}

          <div className="space-y-1 sm:col-span-2">
            <Label>{kind === "purchase" ? "説明" : "詳細"}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>備考</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>閉じる</Button>
          <Button onClick={() => register.mutate()} disabled={!canSubmit || register.isPending}>
            {register.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {registeredUnits.has(unitIdx)
              ? "この単位は登録済み"
              : units.length > 1
                ? `この単位を${kind === "purchase" ? "仕入" : "販管費"}として登録 (${registeredUnits.size + 1}/${units.length})`
                : kind === "purchase" ? "仕入として登録" : "販管費として登録"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
