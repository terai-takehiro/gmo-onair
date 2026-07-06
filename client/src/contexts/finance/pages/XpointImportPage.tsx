/**
 * XpointImportPage — X-Point 申請 PDF 取込
 *
 * Box の監視フォルダから X-Point (OBIC 経費申請書) PDF を読み込み (手動ボタン)、
 * 解析結果を仕入/販管費の登録画面と同等のフォームでレビュー・修正してから登録する。
 * 自動登録は行わず、すべての項目が人間の目のチェックを通ってから確定される。
 */
import { useMemo, useState } from "react";
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
import { Vendor, TaxCategoryLabels, SettlementMethodLabels } from "@/types";
import {
  Loader2, FolderSearch, ExternalLink, FileText, AlertTriangle, CheckCircle2,
  RotateCcw, SkipForward, ScanSearch,
} from "lucide-react";

// ---- サーバーの XpointParseResult に対応する型 (表示に使う分のみ) ----
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

interface VendorMatch { id: string; name: string; matched_by: string }
interface DuplicateRow { id: string; amount: number; recognition_date: string | null; vendor_name: string | null; description: string | null }

interface XpointParseResult {
  parsed: XpointParsed;
  match: {
    vendor: VendorMatch | null;
    vendorCandidates: VendorMatch[];
    project: { id: string; name: string; gls_number: string } | null;
  };
  duplicates: { purchases: DuplicateRow[]; sga: DuplicateRow[] };
  suggested: { taxCategory: string; amountExclusive: number | null; recognitionMonth: string | null };
  parsedAt: string;
}

interface XpointFileRow {
  id: number;
  box_file_id: string;
  file_name: string;
  box_modified_at: string | null;
  xp_number: string | null;
  kind: string;
  status: "new" | "parsed" | "registered" | "skipped" | "error";
  parsed_data: XpointParseResult | null;
  error_message: string | null;
  registered_table: string | null;
  registered_id: string | null;
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

export default function XpointImportPage() {
  const queryClient = useQueryClient();
  const [folderInput, setFolderInput] = useState("");
  const [scanned, setScanned] = useState<{ folderId: string; folderUrl: string; files: XpointFileRow[] } | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ file: XpointFileRow; result: XpointParseResult } | null>(null);
  const [showDone, setShowDone] = useState(false);

  const scan = useMutation({
    mutationFn: async () => {
      const params = folderInput.trim() ? `?folder=${encodeURIComponent(folderInput.trim())}` : "";
      return (await api.get(`/xpoint/files${params}`)).data.data;
    },
    onSuccess: (data) => setScanned(data),
  });

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
      alert(`PDF の解析に失敗しました: ${err?.response?.data?.error?.message || err.message}`);
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
      <div className="space-y-4 lg:space-y-6 p-3 lg:p-6 mx-auto max-w-screen-xl">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">X-Point 申請 PDF 取込</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Box フォルダの X-Point 申請 PDF を読み込み、内容を確認・修正してから仕入 / 販管費に登録します。
            自動では登録されません — <span className="font-medium text-foreground">すべての項目を必ず確認してください</span>。
          </p>
        </div>

        {/* フォルダ読み込み */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">取込元 Box フォルダ (ID または URL・空欄なら既定フォルダ)</Label>
              <Input
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="例: 397127787652 / https://gmo-globalstudio.app.box.com/folder/397127787652"
              />
            </div>
            <Button onClick={() => scan.mutate()} disabled={scan.isPending} className="shrink-0">
              {scan.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FolderSearch className="h-4 w-4 mr-2" />}
              フォルダを読み込み
            </Button>
          </div>
          {scan.isError && (
            <p className="text-sm text-red-600">
              読み込みに失敗しました: {(scan.error as any)?.response?.data?.error?.message || (scan.error as Error).message}
            </p>
          )}
          {scanned && (
            <p className="text-xs text-muted-foreground">
              フォルダ: <a href={scanned.folderUrl} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">{scanned.folderId}<ExternalLink className="h-3 w-3" /></a>
              {" ・ "}PDF {files.length} 件 (処理済み {doneCount} 件)
              <button className="ml-2 underline" onClick={() => setShowDone((v) => !v)}>
                {showDone ? "処理済みを隠す" : "処理済みも表示"}
              </button>
            </p>
          )}
        </div>

        {/* ファイル一覧 */}
        {scanned && (
          <div className="space-y-2">
            {visibleFiles.length === 0 && (
              <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
                {files.length === 0 ? "フォルダに PDF がありません" : "未処理の PDF はありません"}
              </div>
            )}
            {visibleFiles.map((f) => {
              const badge = STATUS_BADGE[f.status];
              const p = f.parsed_data?.parsed;
              return (
                <div key={f.box_file_id} className="rounded-xl border bg-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">{f.file_name}</span>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                      {f.xp_number && <Badge variant="outline" className="text-xs">X-{f.xp_number}</Badge>}
                      {p?.kind === "purchase" && <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 text-xs">仕入</Badge>}
                      {p?.kind === "sga" && <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-xs">販管費</Badge>}
                    </div>
                    {p && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {p.subject}
                        {p.vendorName ? ` ／ ${p.vendorName}` : ""}
                        {p.amountInclusive != null ? ` ／ 税込 ${formatCurrency(p.amountInclusive)}` : ""}
                      </p>
                    )}
                    {f.status === "error" && f.error_message && (
                      <p className="text-xs text-red-600 mt-1">{f.error_message}</p>
                    )}
                    {f.status === "registered" && f.registered_id && (
                      <p className="text-xs text-green-700 mt-1">
                        <Link
                          className="underline"
                          to={f.registered_table === "purchases" ? `/budget/purchases?edit=${f.registered_id}` : `/budget/sga?edit=${f.registered_id}`}
                        >
                          登録レコードを開く
                        </Link>
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

        {!scanned && !scan.isPending && (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            「フォルダを読み込み」を押すと Box フォルダ内の X-Point 申請 PDF を検出します
          </div>
        )}

        {reviewTarget && (
          <XpointReviewDialog
            file={reviewTarget.file}
            result={reviewTarget.result}
            onClose={() => setReviewTarget(null)}
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
// レビューダイアログ — 仕入/販管費の登録画面と同等のフォームで人間がチェック・修正して登録
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
  const [kind, setKind] = useState<"purchase" | "sga">(p.kind === "sga" ? "sga" : "purchase");

  // ---- 共通フィールド ----
  const [taxCategory, setTaxCategory] = useState(result.suggested.taxCategory || "tax10");
  const [amount, setAmount] = useState<number>(result.suggested.amountExclusive ?? p.amountInclusive ?? 0);
  const [settlementNumber, setSettlementNumber] = useState(p.xpNumber || "");
  const [invoiceQualified, setInvoiceQualified] = useState(p.invoiceQualified ? "qualified" : "unqualified");
  const [description, setDescription] = useState(p.description || p.subject || "");
  const [notes, setNotes] = useState(() =>
    [`[X-Point取込] ${file.file_name}`, p.subject, p.account, ...(p.detailLines || [])].filter(Boolean).join("\n")
  );
  const [paymentDueDate, setPaymentDueDate] = useState(p.paymentDueDate || "");

  // ---- 仕入フィールド ----
  const [projectId, setProjectId] = useState(result.match.project?.id || "");
  const [vendorId, setVendorId] = useState(result.match.vendor?.id || "");
  const [createVendor, setCreateVendor] = useState(false);
  const [recognitionMonth, setRecognitionMonth] = useState(result.suggested.recognitionMonth || "");
  const [serviceCompletedDate, setServiceCompletedDate] = useState(p.servicePeriodEnd || "");
  const [isProvisional, setIsProvisional] = useState(false);

  // ---- 販管費フィールド ----
  const [vendorName, setVendorName] = useState(p.vendorName || "");
  const [recognitionDate, setRecognitionDate] = useState(p.recognitionDate || "");

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
      const common = {
        tax_category: taxCategory,
        settlement_method: "xpoint",
        settlement_number: settlementNumber || null,
        invoice_qualified: invoiceQualified === "qualified" ? 1 : 0,
        amount,
        description: description || null,
        notes: notes || null,
        payment_due_date: paymentDueDate || null,
      };
      const body =
        kind === "purchase"
          ? {
              kind,
              new_vendor: createVendor && !vendorId && p.vendorName
                ? { name: p.vendorName, invoice_registration_number: p.invoiceNumber || null }
                : undefined,
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
              kind,
              new_vendor: createVendor && !vendorId && p.vendorName
                ? { name: p.vendorName, invoice_registration_number: p.invoiceNumber || null }
                : undefined,
              sga: {
                ...common,
                vendor_name: vendorName || null,
                vendor_id: vendorId || null,
                recognition_date: recognitionDate,
                expense_type: "spot",
              },
            };
      return (await api.post(`/xpoint/files/${file.id}/register`, body)).data;
    },
    onSuccess: () => onRegistered(),
    onError: (err: any) => {
      alert(`登録に失敗しました: ${err?.response?.data?.error?.message || err.message}`);
    },
  });

  const dupList = kind === "purchase" ? result.duplicates.purchases : result.duplicates.sga;
  const allDup = [...result.duplicates.purchases, ...result.duplicates.sga];

  const recalcFromInclusive = (cat: string) => {
    if (p.amountInclusive != null) setAmount(Math.round(p.amountInclusive / taxRate(cat)));
  };

  const canSubmit = useMemo(() => {
    if (amount <= 0) return false;
    if (kind === "purchase") return !!projectId && (!!vendorId || (createVendor && !!p.vendorName));
    return !!recognitionDate && !!vendorName;
  }, [amount, kind, projectId, vendorId, createVendor, p.vendorName, recognitionDate, vendorName]);

  const vendorOptions = vendors.map((v) => ({ value: v.id, label: v.name }));
  const projectOptions = glsProjects.map((pr) => ({ value: pr.id, label: `${pr.gls_number} ${pr.name}` }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            X-Point 申請の内容確認
            {p.xpNumber && <Badge variant="outline">X-{p.xpNumber}</Badge>}
            <span className="text-xs font-normal text-muted-foreground">{file.file_name}</span>
          </DialogTitle>
        </DialogHeader>

        {/* 抽出結果 (参照用・読み取り専用) */}
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

        {/* 警告 */}
        {(p.warnings.length > 0 || allDup.length > 0) && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1">
            {allDup.length > 0 && (
              <p className="text-xs font-semibold text-red-700 flex items-start gap-1">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                精算番号 X-{p.xpNumber} は既に {result.duplicates.purchases.length > 0 ? `仕入 ${result.duplicates.purchases.length} 件` : ""}
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
            {p.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-800 flex items-start gap-1">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{w}
              </p>
            ))}
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
          {p.kind === "unknown" && (
            <span className="text-xs text-amber-700 self-center">件名から種別を判定できませんでした。選択してください。</span>
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
                {!result.match.project && p.glsNumber && (
                  <p className="text-xs text-amber-700">GLS 番号 {p.glsNumber} に一致する案件が見つかりませんでした。手動で選択してください。</p>
                )}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>仕入先 *</Label>
                <SearchableSelect
                  options={vendorOptions}
                  value={vendorId}
                  onChange={(v) => { setVendorId(v); if (v) setCreateVendor(false); }}
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
                {!vendorId && p.vendorName && (
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
              onValueChange={(v) => { setTaxCategory(v); recalcFromInclusive(v); }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TaxCategoryLabels).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">X-Point の金額は税込表記のため、変更すると税込 {p.amountInclusive != null ? formatCurrency(p.amountInclusive) : "—"} から税抜金額を再計算します</p>
          </div>
          <div className="space-y-1">
            <Label>金額 (税抜) *</Label>
            <CurrencyInput value={amount} onChange={setAmount} />
            {p.amountInclusive != null && (
              <p className="text-xs text-muted-foreground">
                税込 {formatCurrency(p.amountInclusive)} ÷ {taxCategory === "tax10" ? "1.1" : taxCategory === "tax8" ? "1.08" : "1"} = {formatCurrency(Math.round(p.amountInclusive / taxRate(taxCategory)))}
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
            <Label>精算番号 ({SettlementMethodLabels.xpoint})</Label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">X-</span>
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
            {kind === "purchase" ? "仕入として登録" : "販管費として登録"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
