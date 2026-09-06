/**
 * ⑧ 取引先マスター（v4 renewal）
 *
 * v3 の置き土産だった最後の1画面（`docs/v4-plan.md`「そのほか（作り直し前）」の棚卸しで
 * 唯一残っていたもの）を v4 の部品に載せ替えた。**機能は1つも変えていない** —
 * `PageHeader` / `Row`・`RowSlot`・`TableBadge` / `FilterChips` /
 * `Delayed`+`SkeletonRows` / `EmptyState`・`NoSearchResults` に差し替えただけ。
 *
 * 入力欄は `company/CompanyFormFields`、収支サマリーは
 * `company/CompanySummaryDialog` に切り出してある（この画面は一覧と
 * 削除確認だけを持つ）。値の形は `company/types.ts` が1つだけ持つ。
 *
 * ── スマホはカードとして組み直した（監査 2026-08-20・要対応）───
 *
 * PC の行（`company/CompanyRows.tsx`）は `hideOnMobile` で連絡先・
 * インボイス番号・関連ページを消していただけで、役割の絞り込みも
 * `FilterChips` の横並びのままだった。スマホ版は列を縮めるのではなく
 * `company/CompanyCards.tsx` としてカードに組み直し、役割の絞り込みは
 * `MobileFilterBar`（下シート）に畳んだ。**機能・API はここでも変えていない**
 *
 * ── 権限が無い操作ボタンは出さない ──────────────────────────
 *
 * サーバー（`companies.routes.ts`）は 新規/編集 に `sales:owner`・削除に
 * `sales:manager` を要求する。**出したまま押させて 403 で気づかせる形にしない**
 * （v4 の決めごと。料金表・営業活動記録など他の画面と同じ）。
 *
 * 仕入先の役割・種別・インボイス登録番号は `sales:editor`（旧 `budget:editor`）も
 * 要求する（Phase 3-3 でのご判断。権限モデル単純化で `budget` は `sales` に
 * 統合済みのため、いまは `sales:owner` を持つ人は自動的にこの条件も満たす —
 * 「仕入先を兼ねる会社を1件も編集できない」という旧来の組み合わせ事故は
 * 構造的に起きなくなった）。
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { FilterChips, type FilterChipItem } from "@gmo-onair/shared/src/client/ui/filterChips";
import { EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel } from "@gmo-onair/shared/src/client/states";
import { Pagination } from "@gmo-onair/shared/src/client/ui/pagination";
import { CrudFormDialog } from "@gmo-onair/shared/src/client/ui/crud-form-dialog";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import { notifyApiError } from "@gmo-onair/shared/src/client/notify";
import { useIsMobile } from "@gmo-onair/shared/src/client-v4/mobile";
import { MobileFilterBar, MobileFilterField } from "@gmo-onair/shared/src/client-v4/mobileFilterBar";
import { useCrudPage } from "@/hooks/useCrudPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/platform/AuthContext";
import { Plus, Search } from "lucide-react";
import { CompanyFormFields } from "./company/CompanyFormFields";
import { CompanySummaryDialog } from "./company/CompanySummaryDialog";
import { CompanyCards } from "./company/CompanyCards";
import { CompanyRowsHeader, CompanyRow } from "./company/CompanyRows";
import { EMPTY_COMPANY_FORM, type Company, type CompanyForm } from "./company/types";

type RoleFilter = "all" | "customer" | "vendor" | "sga_payee" | "both" | "other";

interface RoleCounts {
  all: number;
  customer: number;
  vendor: number | null;
  sga_payee: number;
  both: number | null;
  other: number;
}

const ROLE_LABELS: { value: RoleFilter; label: string; needsBudget?: boolean }[] = [
  { value: "all",       label: "すべて" },
  { value: "customer",  label: "顧客" },
  { value: "vendor",    label: "仕入先", needsBudget: true },
  { value: "sga_payee", label: "販管費支払先" },
  { value: "both",      label: "顧客兼仕入先", needsBudget: true },
  { value: "other",     label: "その他" },
];

/** `ROLE_LABELS` の値だけを受け付ける。知らない値は無視して既定（すべて）に落ちる */
function isRoleFilter(v: string | null): v is RoleFilter {
  return !!v && ROLE_LABELS.some((t) => t.value === v);
}

export default function CompanyListPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  // **薄い親で1回だけ呼ぶ**（`shared/CLAUDE.md` の決めごと）。早期 return はしない
  const isMobile = useIsMobile();
  // **絞り込みを URL に持たせる**（Phase 2）。`/sales/customers` → ここへの転送が
  // `?role=customer` を付けて来るので、開いた瞬間から「顧客」が選ばれている必要がある
  const [params, setParams] = useSearchParams();
  const roleParam = params.get("role");
  const [role, setRole] = useState<RoleFilter>(isRoleFilter(roleParam) ? roleParam : "all");
  const [summaryTarget, setSummaryTarget] = useState<Company | null>(null);

  const canReadBudget = hasPermission("sales");
  const canManage = hasPermission("sales", "owner");
  const canDelete = hasPermission("sales", "manager");
  const canEditVendor = hasPermission("sales", "editor");

  const crud = useCrudPage<Company>({
    endpoint: "/companies",
    queryKey: ["companies"],
    pageSize: 30,
    extraParams: { role: role === "all" ? undefined : role },
    // **保存・削除の失敗を画面に出す。**（レビューで発見・直した）
    // `useCrudPage` は `onError` を渡さないと共通の受け皿（`NoticeBar`）が
    // 出す形に直したが、この画面自身の文言（「取引先を保存できませんでした」等）の
    // ほうが役割ごとの理由（403 の本文）まで伝わるので、自分で出す
    onError: (action, err) => {
      notifyApiError(
        action === "save" ? "取引先を保存できませんでした" : "取引先を削除できませんでした",
        err,
      );
    },
  });

  const changeRole = (v: RoleFilter) => {
    setRole(v);
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("role"); else next.set("role", v);
    setParams(next, { replace: true });
    crud.setPage(1);
  };

  const roleCounts = (crud.raw as { role_counts?: RoleCounts } | undefined)?.role_counts;
  const chipItems: FilterChipItem<RoleFilter>[] = ROLE_LABELS
    .filter((t) => !t.needsBudget || canReadBudget)
    .map((t) => ({ key: t.value, label: t.label, count: roleCounts ? roleCounts[t.value] : null }));

  const form = useForm<CompanyForm>({ defaultValues: EMPTY_COMPANY_FORM });

  const openEdit = (c: Company) => {
    form.reset({
      name: c.name,
      short_name: c.short_name || "",
      contact_name: c.contact_name || "",
      email: c.email || "",
      phone: c.phone || "",
      address: c.address || "",
      is_customer: !!c.is_customer,
      is_vendor: !!c.is_vendor,
      is_sga_payee: !!c.is_sga_payee,
      is_gmo_group: !!c.is_gmo_group,
      vendor_type: c.vendor_type || "",
      invoice_registration_number: c.invoice_registration_number || "",
      notes: c.notes || "",
      credit_limit_amount: c.credit_limit_amount == null ? "" : String(c.credit_limit_amount),
      credit_check_date: c.credit_check_date || "",
    });
    crud.openEdit(c);
  };

  const openAdd = () => {
    form.reset(EMPTY_COMPANY_FORM);
    crud.openAdd();
  };

  const handleSave = form.handleSubmit((values) => crud.save.mutate({
    ...values,
    // **空欄は null（未設定）。0 として送らない**（`DiscountLimits.tsx` と同じ方式 ─
    // `CurrencyInput` を使わずプレーン文字列で持っているので、ここで数値へ変換する）
    credit_limit_amount: values.credit_limit_amount.trim() === "" ? null : Number(values.credit_limit_amount),
    credit_check_date: values.credit_check_date.trim() === "" ? null : values.credit_check_date,
  }));

  const onDelete = async (c: Company) => {
    const ok = await confirmAction({
      title: `「${c.name}」を削除しますか`,
      description: "取引先マスターから削除します。過去の売上・仕入・予定に付いている記録は残りますが、次から選べなくなります。",
      confirmLabel: "削除",
      tone: "danger",
    });
    if (ok) crud.remove.mutate(c.id);
  };

  const items = useMemo(() => crud.items ?? [], [crud.items]);

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="取引先マスター"
        sub="顧客・仕入先・販管費支払先を1つの台帳で管理します（同じ会社は1回登録すれば足ります）"
        primaryAction={
          // このファイルは `CrudFormDialog onSubmit`（Enter送信）を持つので、
          // **枠の外のボタンにも種類を書く**（`scripts/check-form-submit.mjs`）
          canManage ? (
            <Button type="button" onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />新規取引先
            </Button>
          ) : undefined
        }
      />

      {isMobile ? (
        // **役割絞り込みを下シートに畳む**（監査 2026-08-20・要対応）。
        // FilterChips の横並びは 6 個中いくつかが画面外に出て、残りがあることに
        // 気づけない・払うつもりで押してしまう、の両方が起きる（案件一覧と同じ理由）
        <MobileFilterBar
          search={{ value: crud.search, onChange: crud.setSearch, placeholder: "取引先名・担当者名で検索" }}
          // **既定（すべて）と同じものは数えない**
          activeCount={role === "all" ? 0 : 1}
          onClearAll={() => changeRole("all")}
          title="取引先の絞り込み"
        >
          <MobileFilterField label="役割">
            <Select value={role} onValueChange={(v) => changeRole(v as RoleFilter)}>
              <SelectTrigger aria-label="役割で絞り込む"><SelectValue /></SelectTrigger>
              <SelectContent>
                {chipItems.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                    {t.count != null ? `（${t.count}）` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MobileFilterField>
        </MobileFilterBar>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <FilterChips items={chipItems} value={role} onChange={changeRole} label="役割で絞り込む" />
          <div className="relative min-w-[220px] max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="取引先名・担当者名で検索"
              className="h-9 pl-9"
              value={crud.search}
              onChange={(e) => crud.setSearch(e.target.value)}
              aria-label="取引先を探す"
            />
          </div>
        </div>
      )}

      {crud.isError ? (
        <ErrorPanel title="取引先マスターを読み込めませんでした" error={crud.error} onRetry={() => crud.refetch()} />
      ) : crud.isLoading ? (
        <Delayed><SkeletonRows rows={8} /></Delayed>
      ) : items.length === 0 ? (
        crud.appliedSearch ? (
          <NoSearchResults keyword={crud.appliedSearch} onClearFilters={() => crud.setSearch("")} />
        ) : (
          <EmptyState
            title="取引先がありません"
            description="「新規取引先」から登録すると、案件・見積・仕入・販管費の登録で選べるようになります。"
          />
        )
      ) : isMobile ? (
        // **行を縮めるのではなく、カードとして組み直す**（v4 の決めごと）。
        // 連絡先・インボイス番号・関連ページは PC の列を `hideOnMobile` で消して
        // いただけだった（監査 2026-08-20・要対応）ので、`CompanyCards` に情報を
        // 再構成した。詳しい理由は `company/CompanyCards.tsx` 冒頭のコメント
        <CompanyCards
          items={items}
          canReadBudget={canReadBudget}
          canManage={canManage}
          canDelete={canDelete}
          canEditVendor={canEditVendor}
          onEdit={openEdit}
          onDelete={onDelete}
          onSummary={setSummaryTarget}
          onOpenCustomer={(c) => navigate(`/sales/customers/${c.id}`)}
          onOpenVendor={() => navigate("/budget/vendors")}
        />
      ) : (
        <div className="overflow-x-auto">
          {/*
            ⚠️ **1120px は当てずっぽうではなく、固定列の合計から逆算した値**
            （実ブラウザで発見: 720px にしていたら 1024px 幅で「取引先名」の見出しが
            1文字ずつ縦に折り返り、行の会社名が消えて見えなくなっていた）。
            固定列は `shrink-0` で幅が変わらないため、コンテナが狭いとその分の
            しわ寄せは**唯一縮められる `RowMain`（名前列）だけに集中し、0px まで
            潰れる**（横スクロールには逃げない — `overflow-x-auto` は「コンテナより
            中身が大きいとき」だけ働くので、コンテナ自体を狭いまま維持できてしまうと
            素通りする）。固定列の合計 808px（役割200+連絡先160+インボイス160+
            関連ページ160+操作128）＋ gap 5つ分 60px（`gap-3`=12px×5）＝ 868px に、
            名前列が最低限読める幅として 250px 前後を足して切り上げた

            **PC 専用の分岐（`isMobile` が false）に入ったので `hideOnMobile`／
            `stackOnMobile` はもう要らない**（`company/CompanyRows.tsx` に切り出し
            済み）— スマホは上の `CompanyCards` が描く。
          */}
          <div className="flex min-w-[1120px] flex-col">
            <CompanyRowsHeader canReadBudget={canReadBudget} canManage={canManage} />
            {items.map((c) => (
              <CompanyRow
                key={c.id}
                c={c}
                canReadBudget={canReadBudget}
                canManage={canManage}
                canDelete={canDelete}
                canEditVendor={canEditVendor}
                onEdit={openEdit}
                onDelete={onDelete}
                onSummary={setSummaryTarget}
                onOpenCustomer={(company) => navigate(`/sales/customers/${company.id}`)}
                onOpenVendor={() => navigate("/budget/vendors")}
              />
            ))}
          </div>
        </div>
      )}

      <Pagination
        page={crud.page}
        totalPages={crud.pagination?.totalPages ?? 1}
        total={crud.pagination?.total ?? 0}
        onChange={crud.setPage}
        disabled={crud.isLoading}
      />

      <CrudFormDialog
        crud={crud}
        size="lg"
        title={{ create: "新規取引先登録", edit: "取引先を編集" }}
        description="役割は複数選べます。同じ会社は1回登録すれば、顧客・仕入先・販管費支払先のどの場面でも選べます。"
        submitLabel={{ create: "登録", edit: "更新" }}
        onSubmit={handleSave}
      >
        <CompanyFormFields form={form} editing={!!crud.editingItem} open={crud.dialogOpen} canEditVendor={canEditVendor} />
      </CrudFormDialog>

      <CompanySummaryDialog
        open={!!summaryTarget}
        onOpenChange={(open) => { if (!open) setSummaryTarget(null); }}
        company={summaryTarget}
      />
    </div>
  );
}
