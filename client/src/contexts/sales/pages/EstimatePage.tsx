/**
 * 見積をつくる — 案件 ＞ お金 ＞ 見積 (デザイン 30章 37a / 仕様書 §7.4)
 *
 * 料金表から選んで、AI が下書きし、**粗利がその場で出る**1画面。金額を決めるのは人。
 *
 * ── この画面の決めごと ────────────────────────────────
 *  - 明細は**グループ** (スタジオ / 技術・人員 / 制作・その他) で並べる。
 *    行に**仕入の列**を持ち、受注したときにそのまま見込み仕入になる (二度打ちしない)
 *  - 値引きを入れると粗利率がその場で動き、**30% を切ると赤**で出る (止めはしない)
 *  - 「この金額で確定する」→ 想定金額に入り、ステージが見積提案に進む
 *  - **ONAiR はメールを送らない**。PDF は BOX に残り、送るのは人。
 *    「送った」を押すと次にやること (申込書をもらう) が自動で立つ
 *  - AI が推測で補った行にはオレンジの印を出す (人が足した行と見分けられるように)
 *
 * 保存は明示操作 (未保存の件数をヘッダーに出す)。金額を含む画面なので自動保存はしない。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@gmo-onair/shared/src/client/ui/money";
import { NoticeBar, setNotice, clearNotice } from "@gmo-onair/shared/src/client/ui/notice";
import { ErrorPanel, SkeletonCard } from '@gmo-onair/shared/src/client/states';
import { useAuth } from "@/contexts/platform/AuthContext";
import PricingPickerDialog, { type PickedPricingRow } from "../components/estimate/PricingPickerDialog";
import {
  ChevronRight, ChevronLeft, Printer, Sparkles, Plus, Trash2, Loader2, Check, Send,
  History, BookOpen, CalendarClock, Receipt, AlertTriangle,
} from "lucide-react";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { AI_ACTOR_LABEL } from '@gmo-onair/shared/src/client/aiAttribution';
import { useAiAvailable } from '@gmo-onair/shared/src/client/hooks/useAiAvailable';

/** 明細のグループ。3つに固定する (増やすと並び順が読めなくなる) */
const GROUPS = ["スタジオ", "技術・人員", "制作・その他"] as const;
type Group = typeof GROUPS[number];

const UNIT_OPTIONS = ["日", "時間", "台", "人", "系統", "式", "点", "本"];

interface Row {
  key: string;
  description: string;
  category: Group;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  cost_amount: number;
  item_notes: string | null;
  pricing_item_id: string | null;
  is_ai_suggested: boolean;
}

interface EstimateView {
  project: {
    id: string; name: string; gls_number: string | null; stage: string;
    customer_name: string | null; customer_type: string | null;
    expected_amount: number; event_start: string | null; event_end: string | null;
    box_url_external: string | null;
  };
  estimate: {
    id: string; version: number; discount_amount: number; tax_category: string;
    sent_at: string | null; confirmed_at: string | null; pdf_box_file_id: string | null;
  } | null;
  items: Array<Record<string, any>>;
  totals: {
    items_total: number; discount_amount: number; subtotal: number; tax_amount: number;
    payable: number; cost_total: number; gross_profit: number;
    gross_margin: number | null; below_warn: boolean;
  };
  // 人名 (実行者・AI が書いた指示者) は画面に出さないので受け取らない (aiAttribution.ts)
  ai_origin: { created_at: string; model: string | null } | null;
  next_action: { text: string; date: string } | null;
  similar: Array<Record<string, any>>;
}

/** 粗利率がこれを切ると赤で出す (サーバーの GROSS_MARGIN_WARN と同じ値) */
const GROSS_MARGIN_WARN = 0.3;
const TAX_RATE: Record<string, number> = { tax10: 0.1, tax8: 0.08, exempt: 0 };

let seq = 0;
const newKey = () => `row-${Date.now()}-${seq++}`;

function toRow(it: Record<string, any>): Row {
  const category = GROUPS.includes(it.category as Group) ? (it.category as Group) : "制作・その他";
  return {
    key: String(it.id ?? newKey()),
    description: String(it.description ?? ""),
    category,
    quantity: Number(it.quantity) || 0,
    unit: it.unit ? String(it.unit) : "式",
    unit_price: Number(it.unit_price) || 0,
    amount: Number(it.amount) || 0,
    cost_amount: Number(it.cost_amount) || 0,
    item_notes: it.item_notes ?? null,
    pricing_item_id: it.pricing_item_id ?? null,
    is_ai_suggested: !!it.is_ai_suggested,
  };
}

/** 画面とサーバーで同じ式を使う (サーバー: estimate.service.computeTotals) */
function computeTotals(rows: Row[], discount: number, taxCategory: string) {
  const itemsTotal = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const costTotal = rows.reduce((s, r) => s + (Number(r.cost_amount) || 0), 0);
  const subtotal = itemsTotal - Math.max(0, discount);
  const taxAmount = Math.round(subtotal * (TAX_RATE[taxCategory] ?? 0.1));
  const grossProfit = subtotal - costTotal;
  const grossMargin = subtotal > 0 ? grossProfit / subtotal : null;
  return {
    itemsTotal, costTotal, subtotal, taxAmount, payable: subtotal + taxAmount,
    grossProfit, grossMargin,
    belowWarn: grossMargin !== null && grossMargin < GROSS_MARGIN_WARN,
  };
}

/** 期限 (日付だけの列) は「その日の 18:00 まで」として読む (製品全体の決めごと) */
function deadlineLabel(date: string): { text: string; overdue: boolean } {
  const due = new Date(`${date}T18:00:00`);
  const now = new Date();
  const overdue = due.getTime() < now.getTime();
  const days = Math.floor(Math.abs(now.getTime() - due.getTime()) / 86_400_000);
  const md = `${due.getMonth() + 1}/${String(due.getDate()).padStart(2, "0")} 18:00`;
  if (!overdue) return { text: `${md} まで`, overdue: false };
  return { text: `${md} まで（${days > 0 ? `${days}日超過` : "本日超過"}）`, overdue: true };
}

export default function EstimatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("sales", "editor");
  // AI をつないでいない環境では下書きのボタンを出さない (押しても必ず失敗する)
  const ai = useAiAvailable(api);

  const [rows, setRows] = useState<Row[]>([]);
  const [discount, setDiscount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // お知らせ帯は共通の1本 (§4.15)。画面を離れるときに残さない
  useEffect(() => () => clearNotice(), []);

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: EstimateView }>({
    queryKey: ["estimate", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/estimate`)).data,
    enabled: !!projectId,
  });
  const view = data?.data;

  // サーバーの内容をフォームに取り込む。編集中 (dirty) は上書きしない
  useEffect(() => {
    if (!view) return;
    const stamp = `${view.estimate?.id ?? "none"}:${view.items.length}:${view.estimate?.version ?? 0}`;
    if (dirty && loadedFor.current !== null) return;
    if (loadedFor.current === stamp) return;
    loadedFor.current = stamp;
    setRows(view.items.map(toRow));
    setDiscount(view.estimate?.discount_amount ?? 0);
    setDirty(false);
  }, [view, dirty]);

  const taxCategory = view?.estimate?.tax_category ?? "tax10";
  const totals = useMemo(() => computeTotals(rows, discount, taxCategory), [rows, discount, taxCategory]);

  const patchRow = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== key) return r;
      const next = { ...r, ...patch };
      // 数量か単価を直したら金額を組み直す (金額を直接直した場合はそのまま残す)
      if (patch.quantity !== undefined || patch.unit_price !== undefined) {
        next.amount = Math.round((Number(next.quantity) || 0) * (Number(next.unit_price) || 0));
      }
      return next;
    }));
    setDirty(true);
  };

  const addRow = (group: Group) => {
    setRows((prev) => [...prev, {
      key: newKey(), description: "", category: group, quantity: 1, unit: "式",
      unit_price: 0, amount: 0, cost_amount: 0, item_notes: null,
      pricing_item_id: null, is_ai_suggested: false,
    }]);
    setDirty(true);
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
    setDirty(true);
  };

  const addPicked = (picked: PickedPricingRow[]) => {
    setRows((prev) => [...prev, ...picked.map((p) => ({
      key: newKey(),
      description: p.description,
      category: (GROUPS.includes(p.category as Group) ? p.category : "制作・その他") as Group,
      quantity: p.quantity, unit: p.unit, unit_price: p.unit_price,
      amount: p.quantity * p.unit_price, cost_amount: 0, item_notes: null,
      pricing_item_id: p.pricing_item_id, is_ai_suggested: false,
    }))]);
    setDirty(true);
  };

  const payload = () => ({
    discount_amount: discount,
    tax_category: taxCategory,
    items: rows
      .filter((r) => r.description.trim())
      .map((r) => ({
        description: r.description.trim(), category: r.category, quantity: r.quantity,
        unit: r.unit, unit_price: r.unit_price, amount: r.amount,
        cost_amount: r.cost_amount, item_notes: r.item_notes,
        pricing_item_id: r.pricing_item_id, is_ai_suggested: r.is_ai_suggested,
      })),
  });

  const afterServer = (next: EstimateView) => {
    qc.setQueryData(["estimate", projectId], { data: next });
    loadedFor.current = null;
    setDirty(false);
    setRows(next.items.map(toRow));
    setDiscount(next.estimate?.discount_amount ?? 0);
  };

  const saveMutation = useMutation({
    mutationFn: async () => (await api.put(`/projects/${projectId}/estimate`, payload())).data.data as EstimateView,
    onSuccess: (next) => { afterServer(next); setNotice({ tone: "success", title: "見積を保存しました", description: "まだ確定していません（想定金額には入っていません）。" }); },
    onError: (e: any) => setNotice({ tone: "error", title: e?.response?.data?.error?.message ?? "保存できませんでした", description: "入力した内容はこの画面に残っています。" }),
  });

  const draftMutation = useMutation({
    mutationFn: async () => (await api.post(`/projects/${projectId}/estimate/ai-draft`)).data.data as EstimateView & { ai_draft?: { bases: string[] } },
    onSuccess: (next) => { afterServer(next); setNotice({ tone: "info", title: "AI が下書きを作りました", description: "金額と仕入を確かめてから確定してください。" }); },
    onError: (e: any) => setNotice({ tone: "warning", title: e?.response?.data?.error?.message ?? "下書きを作れませんでした" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => (await api.post(`/projects/${projectId}/estimate/confirm`)).data.data as EstimateView & { stage_changed?: boolean },
    onSuccess: (next) => {
      afterServer(next);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      setNotice({
        tone: "success",
        title: "この金額で確定しました",
        description: next.stage_changed
          ? "想定金額に入り、ステージが見積提案に進みました。"
          : "想定金額に入りました。",
      });
    },
    onError: (e: any) => setNotice({ tone: "error", title: e?.response?.data?.error?.message ?? "確定できませんでした" }),
  });

  const sentMutation = useMutation({
    mutationFn: async () => (await api.post(`/projects/${projectId}/estimate/sent`)).data.data as EstimateView,
    onSuccess: (next) => { afterServer(next); setNotice({ tone: "success", title: "送ったことを記録しました", description: "次にやること「申込書をもらう」を立てました。" }); },
    onError: (e: any) => setNotice({ tone: "error", title: e?.response?.data?.error?.message ?? "記録できませんでした" }),
  });

  const pdfMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/projects/${projectId}/estimate/pdf`, {}, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `見積書_${view?.project.gls_number ?? "案件"}_第${view?.estimate?.version ?? 1}版.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      return res.headers["x-estimate-box-saved"] === "1";
    },
    onSuccess: (boxSaved) => setNotice({
      tone: boxSaved ? "success" : "warning",
      title: boxSaved ? "PDF を出して BOX に残しました" : "PDF を出しました（BOX には残せませんでした）",
      description: boxSaved
        ? "送るのは自分のメールです（ONAiR は送りません）。"
        : "案件の BOX フォルダが未作成か、BOX が未設定です。PDF はダウンロードされています。",
    }),
    onError: (e: any) => setNotice({ tone: "error", title: e?.response?.data?.error?.message ?? "PDF を作れませんでした" }),
  });

  if (isLoading) {
    return <div className="p-6"><SkeletonCard /></div>;
  }
  if (isError || !view) {
    return (
      <div className="p-6">
        <ErrorPanel title="見積を読み込めませんでした" error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const customerType = view.project.customer_type === "internal" ? "internal" : "external";
  const busy = saveMutation.isPending || draftMutation.isPending || confirmMutation.isPending
    || sentMutation.isPending || pdfMutation.isPending;
  const deadline = view.next_action ? deadlineLabel(view.next_action.date) : null;
  const hasRows = rows.some((r) => r.description.trim());
  const rowCount = rows.filter((r) => r.description.trim()).length;

  return (
    <div className="min-h-full bg-background">
      {/* ヘッダー — 案件 ＞ 案件名 ＞ 見積 / 状態 / 期限 / PDF / 確定 */}
      <div className="sticky top-0 z-10 flex min-h-[60px] flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-divider bg-card px-4 py-2 sm:px-[22px]">
        {/* スマホは案件へ戻る1つだけ (44px)。パンくずを並べるとタップ領域が 24px になり押し間違える */}
        <button
          type="button"
          onClick={() => navigate(`/sales/projects/${projectId}`)}
          className="flex min-h-tap min-w-0 items-center gap-1.5 text-[13.5px] text-muted-foreground sm:hidden"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          <span className="max-w-[160px] truncate">{view.project.name}</span>
          <span className="whitespace-nowrap font-bold text-foreground">／ 見積</span>
        </button>

        <div className="hidden min-w-0 items-center gap-2 text-[13.5px] text-muted-foreground sm:flex">
          <button type="button" onClick={() => navigate("/projects")} className="flex h-11 items-center whitespace-nowrap hover:underline">案件</button>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <button
            type="button"
            onClick={() => navigate(`/sales/projects/${projectId}`)}
            className="flex h-11 max-w-[360px] items-center truncate hover:underline"
          >
            <span className="truncate">{view.project.name}</span>
          </button>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-nowrap font-bold text-foreground">見積</span>
        </div>

        <span className={`inline-flex h-[26px] shrink-0 items-center rounded-[7px] px-2.5 text-[12.5px] font-bold ${
          view.estimate?.confirmed_at
            ? "bg-success-surface text-success"
            : "bg-warning-surface text-warning-strong"
        }`}>
          {view.estimate?.confirmed_at ? "確定" : "下書き"} ・ 第{view.estimate?.version ?? 1}版
        </span>

        {dirty && (
          <span className="inline-flex h-[26px] shrink-0 items-center rounded-[7px] bg-secondary px-2.5 text-[12.5px] font-bold text-secondary-foreground">
            未保存
          </span>
        )}

        <div className="flex-1" />

        {deadline && (
          <span
            className={`font-number whitespace-nowrap rounded-md px-2.5 py-[3px] text-xs ${
              deadline.overdue ? "bg-destructive-surface text-destructive" : "bg-warning-surface text-warning-strong"
            }`}
            title={view.next_action?.text ?? undefined}
          >
            {view.next_action?.text}　{deadline.text}
          </span>
        )}

        {canEdit && (
          <Button variant="outline" size="sm" className="h-10" onClick={() => saveMutation.mutate()} disabled={busy || !dirty}>
            {saveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            保存
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-10" onClick={() => pdfMutation.mutate()} disabled={busy || !view.estimate || !hasRows}>
          {pdfMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4 text-muted-foreground" />}
          PDFにする
        </Button>
        {canEdit && (
          <Button
            size="sm"
            className="h-10"
            onClick={() => confirmMutation.mutate()}
            disabled={busy || !view.estimate || !hasRows || dirty}
            title={dirty ? "先に保存してください" : undefined}
          >
            {confirmMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            この金額で確定する
          </Button>
        )}
      </div>

      <NoticeBar />

      <div className="flex flex-col items-start gap-[18px] px-4 py-5 sm:px-6 sm:pb-[26px] xl:flex-row">
        {/* 左 — AI下書き + 明細 */}
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          {/* AI が作った下書き */}
          <div className="rounded-lg border border-ai-border bg-card p-4">
            <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
              <Sparkles className="h-4 w-4 shrink-0 text-ai" />
              <p className="text-[15px] font-bold">AIが作った下書き</p>
              <span className="text-[12.5px] text-muted-foreground">似た案件と料金表から</span>
              <div className="flex-1" />
              {/* AI をつないでいない環境ではボタンを出さない (押しても必ず失敗する) */}
              {canEdit && ai.available && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-ai-border text-ai hover:bg-ai-surface"
                  onClick={async () => {
                    // 何が消えるかを書く。「よろしいですか？」だけでは判断できない
                    if (
                      hasRows &&
                      !(await confirmAction({
                        title: "いまの明細を AI の下書きで置き換えますか？",
                        description: `いま入っている ${rowCount} 行はすべて消えて、AI が作った明細に入れ替わります。値引きの設定も外れます。元に戻せません。`,
                        confirmLabel: "置き換える",
                        tone: "danger",
                      }))
                    ) {
                      return;
                    }
                    draftMutation.mutate();
                  }}
                  disabled={busy}
                >
                  {draftMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  {hasRows ? "作り直す" : "下書きを作る"}
                </Button>
              )}
              {canEdit && !ai.available && !ai.loading && (
                <span className="text-[12px] text-muted-foreground">
                  AI はいまつないでいません。明細は下の「行を足す」から入れてください。
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {view.similar.slice(0, 1).map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-[5px] text-[12.5px] text-secondary-foreground">
                  <History className="h-3.5 w-3.5 text-muted-foreground" />
                  {s.name}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-[5px] text-[12.5px] text-secondary-foreground">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                料金表
              </span>
              {view.project.event_start && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-[5px] text-[12.5px] text-secondary-foreground">
                  <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                  この案件の予定（{formatShortDate(view.project.event_start)}）
                </span>
              )}
            </div>
            {/* 作ったのは AI。人名 (接続ユーザー・AI が書いた指示者) は出さない (aiAttribution.ts) */}
            {view.ai_origin && (
              <p className="mt-2.5 text-xs text-muted-foreground">
                {formatShortDate(String(view.ai_origin.created_at).slice(0, 10))} に {AI_ACTOR_LABEL}
                　金額と仕入は必ず自分で確かめてください。
              </p>
            )}
          </div>

          {/* 明細 */}
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {/* 見出し (PC のみ。狭い画面は行ごとのラベルで読む) */}
            <div className="hidden min-h-tap items-center gap-3.5 border-b border-divider bg-muted/40 px-[18px] text-[12.5px] font-bold text-muted-foreground lg:flex">
              <span className="min-w-0 flex-1">品目</span>
              <span className="w-[72px] shrink-0 text-right">数量</span>
              <span className="w-[56px] shrink-0 text-center">単位</span>
              <span className="w-[128px] shrink-0 text-right">単価</span>
              <span className="w-[128px] shrink-0 text-right">金額</span>
              <span className="w-[96px] shrink-0 text-right">仕入</span>
              <span className="w-[32px] shrink-0" />
            </div>

            {GROUPS.map((g) => {
              const groupRows = rows.filter((r) => r.category === g);
              const sum = groupRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
              return (
                <div key={g}>
                  <div className="flex min-h-[36px] items-center gap-2.5 border-b border-row bg-accent/40 px-[18px]">
                    <span className="whitespace-nowrap text-[13px] font-extrabold text-primary">{g}</span>
                    <div className="flex-1" />
                    <Money value={sum} className="w-[128px] text-[12.5px] text-muted-foreground" />
                  </div>

                  {groupRows.length === 0 ? (
                    <div className="border-b border-row px-[18px] py-3 text-xs text-muted-foreground">
                      この区分の明細はまだありません。
                    </div>
                  ) : groupRows.map((r) => (
                    <div
                      key={r.key}
                      className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-row px-[18px] py-2.5 hover:bg-accent/20 lg:flex-nowrap lg:py-0 lg:min-h-[52px]"
                    >
                      <div className="min-w-0 flex-1 basis-full lg:basis-auto">
                        <Input
                          value={r.description}
                          onChange={(e) => patchRow(r.key, { description: e.target.value })}
                          disabled={!canEdit}
                          placeholder="品目"
                          className="h-9 border-transparent bg-transparent px-1 text-[13.5px] font-bold hover:border-border focus:border-input disabled:opacity-100"
                        />
                        <div className="flex items-center gap-2 px-1">
                          <Input
                            value={r.item_notes ?? ""}
                            onChange={(e) => patchRow(r.key, { item_notes: e.target.value || null })}
                            disabled={!canEdit}
                            placeholder="補足（任意）"
                            className={`h-7 border-transparent bg-transparent px-0 text-xs hover:border-border focus:border-input disabled:opacity-100 ${
                              r.is_ai_suggested ? "text-warning-strong" : "text-muted-foreground"
                            }`}
                          />
                          {r.is_ai_suggested && (
                            <span className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md bg-warning-surface px-1.5 text-[11px] font-bold text-warning-strong">
                              <AlertTriangle className="h-3 w-3" />AIが補いました
                            </span>
                          )}
                        </div>
                      </div>

                      <label className="flex items-center gap-1 lg:hidden"><span className="text-xs text-muted-foreground">数量</span>
                        <Input type="number" min={0} value={r.quantity} disabled={!canEdit}
                          onChange={(e) => patchRow(r.key, { quantity: Number(e.target.value) || 0 })}
                          className="h-9 w-[72px] text-right font-number" />
                      </label>
                      <Input type="number" min={0} value={r.quantity} disabled={!canEdit}
                        onChange={(e) => patchRow(r.key, { quantity: Number(e.target.value) || 0 })}
                        className="hidden h-9 w-[72px] shrink-0 text-right font-number lg:block" />

                      <select
                        value={r.unit}
                        disabled={!canEdit}
                        onChange={(e) => patchRow(r.key, { unit: e.target.value })}
                        className="h-9 w-[56px] shrink-0 rounded-control border border-input bg-background px-1 text-center text-[12.5px] text-muted-foreground disabled:opacity-100"
                      >
                        {[...new Set([r.unit, ...UNIT_OPTIONS])].filter(Boolean).map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>

                      <label className="flex items-center gap-1 lg:hidden"><span className="text-xs text-muted-foreground">単価</span>
                        <Input type="number" min={0} value={r.unit_price} disabled={!canEdit}
                          onChange={(e) => patchRow(r.key, { unit_price: Number(e.target.value) || 0 })}
                          className="h-9 w-[128px] text-right font-number" />
                      </label>
                      <Input type="number" min={0} value={r.unit_price} disabled={!canEdit}
                        onChange={(e) => patchRow(r.key, { unit_price: Number(e.target.value) || 0 })}
                        className="hidden h-9 w-[128px] shrink-0 text-right font-number lg:block" />

                      <Money value={r.amount} className="w-[128px] shrink-0 text-[14.5px] font-bold" />

                      <label className="flex items-center gap-1 lg:hidden"><span className="text-xs text-muted-foreground">仕入</span>
                        <Input type="number" min={0} value={r.cost_amount} disabled={!canEdit}
                          onChange={(e) => patchRow(r.key, { cost_amount: Number(e.target.value) || 0 })}
                          className="h-9 w-[96px] text-right font-number" />
                      </label>
                      <Input type="number" min={0} value={r.cost_amount} disabled={!canEdit}
                        onChange={(e) => patchRow(r.key, { cost_amount: Number(e.target.value) || 0 })}
                        className="hidden h-9 w-[96px] shrink-0 text-right font-number lg:block"
                        title="外部に払う見込み額。社内でまわせる作業は 0 のままにしてください" />

                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeRow(r.key)}
                          className="flex h-9 w-[32px] shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-destructive-surface hover:text-destructive"
                          title="この行を消す"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2.5 px-[18px] py-3">
                <Button variant="outline" size="sm" className="h-9" onClick={() => setPickerOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" />料金表から足す
                </Button>
                {GROUPS.map((g) => (
                  <Button key={g} variant="outline" size="sm" className="h-9" onClick={() => addRow(g)}>
                    <Plus className="mr-1 h-4 w-4" />{g}に1行
                  </Button>
                ))}
                <div className="flex-1" />
                <span className="text-[12.5px] text-muted-foreground">
                  仕入の列に入れた金額は、受注したときに見込み仕入の明細になります
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 右 — いまの金額 / 似た案件 / 送ったあと */}
        <div className="flex w-full shrink-0 flex-col gap-3.5 xl:w-[392px]">
          <div className="rounded-lg border border-gmo-blue-100 bg-card p-4">
            <p className="mb-2.5 text-[15px] font-bold">いまの金額</p>

            <TotalRow label="小計（税抜）" value={totals.subtotal} size="16px" bold />
            <TotalRow label={`消費税 ${taxCategory === "tax8" ? "8%" : taxCategory === "exempt" ? "（非課税）" : "10%"}`} value={totals.taxAmount} />
            <TotalRow label="お客様の支払額" value={totals.payable} size="18px" bold />
            <TotalRow label="仕入（見込み）" value={totals.costTotal} />
            <TotalRow
              label="粗利"
              value={totals.grossProfit}
              size="20px"
              bold
              tone={totals.belowWarn ? "danger" : "success"}
            />
            <div className="flex items-baseline gap-2.5 border-b border-row py-2">
              <span className="min-w-0 flex-1 text-[13px] font-bold text-muted-foreground">粗利率</span>
              <span className={`font-number w-[128px] text-right text-[16px] font-bold ${
                totals.grossMargin === null ? "text-muted-foreground"
                  : totals.belowWarn ? "text-destructive" : "text-success"
              }`}>
                {totals.grossMargin === null ? "—" : `${(totals.grossMargin * 100).toFixed(1)}%`}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2.5">
              <span className="whitespace-nowrap text-[12.5px] text-muted-foreground">値引き</span>
              <Input
                type="number"
                min={0}
                value={discount}
                disabled={!canEdit}
                onChange={(e) => { setDiscount(Math.max(0, Number(e.target.value) || 0)); setDirty(true); }}
                className="h-9 flex-1 text-right font-number"
              />
              <span className="whitespace-nowrap text-[12.5px] text-muted-foreground">円</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              値引きを入れると粗利率がその場で動きます。30%を切ると赤で出ます（止めはしません）。
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-2.5 text-[15px] font-bold">似た案件との比較</p>
            {view.similar.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                比べられる実績がまだありません（確定した売上のある案件が対象です）。
              </p>
            ) : view.similar.map((s) => {
              const rev = Number(s.revenue_total) || 0;
              const pur = Number(s.purchase_total) || 0;
              const gp = rev > 0 ? Math.round(((rev - pur) / rev) * 100) : null;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => navigate(`/sales/projects/${s.id}`)}
                  className="h-ctl-3 flex w-full items-center gap-2.5 border-b border-row text-left last:border-b-0 hover:bg-accent/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{s.name}</p>
                    <p className="font-number text-xs text-muted-foreground">
                      {s.event_start ? formatShortDate(s.event_start) : "実施日なし"}
                      {s.same_customer ? " ・ 同じお客様" : ""}
                    </p>
                  </div>
                  <Money value={rev} className="w-[128px] text-[13.5px] font-bold" />
                  <span className="font-number w-[56px] shrink-0 text-right text-[12.5px] text-muted-foreground">
                    {gp === null ? "—" : `${gp}%`}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-2.5 text-[15px] font-bold">送ったあと</p>
            <AfterItem icon={<Check className="h-[15px] w-[15px] text-success" />}
              text="「この金額で確定する」を押すと想定金額に入り、案件のステージが見積提案になります。" />
            <AfterItem icon={<Printer className="h-[15px] w-[15px] text-muted-foreground" />}
              text="PDFはBOXに残ります。送るのは自分のメールです（ONAiRは送りません）。" />
            <AfterItem icon={<CalendarClock className="h-[15px] w-[15px] text-primary" />}
              text="送ったら次にやること（申込書をもらう）が自動で立ちます。" />
            <AfterItem icon={<Receipt className="h-[15px] w-[15px] text-muted-foreground" />}
              text="仕入の列に入れた金額は、受注したときに見込み仕入の明細になります（二度打ちしません）。" />

            {canEdit && (
              <Button
                variant="outline"
                className="mt-3 h-10 w-full"
                onClick={() => sentMutation.mutate()}
                disabled={busy || !view.estimate || !hasRows}
              >
                {sentMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                {view.estimate?.sent_at ? "もう一度送ったと記録する" : "送ったと記録する"}
              </Button>
            )}
            {view.estimate?.sent_at && (
              <p className="mt-2 font-number text-xs text-muted-foreground">
                最後に送ったと記録: {formatShortDate(String(view.estimate.sent_at).slice(0, 10))}
              </p>
            )}
          </div>
        </div>
      </div>

      <PricingPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        customerType={customerType}
        onPick={addPicked}
      />
    </div>
  );
}

function TotalRow({ label, value, size = "14px", bold, tone }: {
  label: string; value: number; size?: string; bold?: boolean;
  tone?: "success" | "danger";
}) {
  return (
    <div className="flex items-baseline gap-2.5 border-b border-row py-2">
      <span className={`min-w-0 flex-1 text-[13px] ${bold ? "font-bold text-secondary-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
      <Money
        value={value}
        className={`w-[128px] ${bold ? "font-bold" : ""} ${
          tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : ""
        }`}
        style={{ fontSize: size }}
      />
    </div>
  );
}

function AfterItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="mt-1 shrink-0">{icon}</span>
      <p className="text-[12.5px] leading-relaxed">{text}</p>
    </div>
  );
}
