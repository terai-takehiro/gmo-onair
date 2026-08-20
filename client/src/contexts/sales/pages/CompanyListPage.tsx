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
 * ── 権限が無い操作ボタンは出さない ──────────────────────────
 *
 * サーバー（`companies.routes.ts`）は 新規/編集 に `sales:owner`・削除に
 * `sales:manager` を要求する。**出したまま押させて 403 で気づかせる形にしない**
 * （v4 の決めごと。料金表・営業活動記録など他の画面と同じ）。
 *
 * 仕入先の役割・種別・インボイス登録番号は `budget:editor` も要求する
 * （Phase 3-3 でのご判断: `budget:editor` 単独は閲覧のみ、編集は `sales:owner` 必須。
 * さらに `budget:editor` を持たない `sales:owner` は**仕入先を兼ねる会社を
 * 1件も編集できない** — サーバーが `existing.is_vendor` を見て全項目を止めるため）。
 * その組み合わせが起きる行だけ、編集ボタンを disabled にして理由を出す。
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { FilterChips, type FilterChipItem } from "@gmo-onair/shared/src/client/ui/filterChips";
import { EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel } from "@gmo-onair/shared/src/client/states";
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from "@gmo-onair/shared/src/client/ui/row";
import { TableBadge } from "@gmo-onair/shared/src/client/ui/tableBadge";
import { Pagination } from "@gmo-onair/shared/src/client/ui/pagination";
import { CrudFormDialog } from "@gmo-onair/shared/src/client/ui/crud-form-dialog";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import { notifyApiError } from "@gmo-onair/shared/src/client/notify";
import { useCrudPage } from "@/hooks/useCrudPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/platform/AuthContext";
import { Plus, Pencil, Trash2, ExternalLink, BarChart3, Search } from "lucide-react";
import { CompanyFormFields } from "./company/CompanyFormFields";
import { CompanySummaryDialog } from "./company/CompanySummaryDialog";
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

/** この会社が持つ役割のバッジ（グループの印は別枠なのでここには含めない） */
function RoleBadges({ c }: { c: Company }) {
  if (!c.is_customer && !c.is_vendor && !c.is_sga_payee) {
    return <TableBadge label="その他" w={null} variant="outline" />;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {c.is_customer && <TableBadge label="顧客" w={null} variant="secondary" />}
      {c.is_vendor && <TableBadge label={c.vendor_type || "仕入先"} w={null} variant="info" />}
      {c.is_sga_payee && <TableBadge label="販管費支払先" w={null} variant="warning" />}
    </span>
  );
}

export default function CompanyListPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  // **絞り込みを URL に持たせる**（Phase 2）。`/sales/customers` → ここへの転送が
  // `?role=customer` を付けて来るので、開いた瞬間から「顧客」が選ばれている必要がある
  const [params, setParams] = useSearchParams();
  const roleParam = params.get("role");
  const [role, setRole] = useState<RoleFilter>(isRoleFilter(roleParam) ? roleParam : "all");
  const [summaryTarget, setSummaryTarget] = useState<Company | null>(null);

  const canReadBudget = hasPermission("budget");
  const canManage = hasPermission("sales", "owner");
  const canDelete = hasPermission("sales", "manager");
  const canEditVendor = hasPermission("budget", "editor");

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
    });
    crud.openEdit(c);
  };

  const openAdd = () => {
    form.reset(EMPTY_COMPANY_FORM);
    crud.openAdd();
  };

  const handleSave = form.handleSubmit((values) => crud.save.mutate(values));

  const onDelete = async (c: Company) => {
    const ok = await confirmAction({
      title: `「${c.name}」を削除しますか`,
      description: "取引先マスターから削除します。過去の売上・仕入・予定に付いている記録は残りますが、次から選べなくなります。",
      confirmLabel: "削除する",
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
          canManage ? (
            <Button onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />新規取引先
            </Button>
          ) : undefined
        }
      />

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

      {crud.isError ? (
        <ErrorPanel title="取引先マスターを読み込めませんでした" error={crud.error} onRetry={() => crud.refetch()} />
      ) : crud.isLoading ? (
        <Delayed><SkeletonRows rows={8} /></Delayed>
      ) : items.length === 0 ? (
        crud.search ? (
          <NoSearchResults keyword={crud.search} onClearFilters={() => crud.setSearch("")} />
        ) : (
          <EmptyState
            title="取引先がありません"
            description="「新規取引先」から登録すると、案件・見積・仕入・販管費の登録で選べるようになります。"
          />
        )
      ) : (
        <div className="overflow-x-auto">
          {/* **`min-w` は `sm:` 以上だけに効かせる。** スマホは `Row stackOnMobile` で
              1列に畳むので、ここで無条件に 720px 強制すると畳んだ行まで
              横スクロールが必要になり、役割バッジや操作ボタンが画面の外に出てしまう
              （実ブラウザで発見: 375px で操作列が完全に見えなくなっていた） */}
          <div className="flex flex-col sm:min-w-[720px]">
            <RowHeader className="hidden sm:flex">
              <RowMain>取引先名</RowMain>
              <RowSlot w={200}>役割</RowSlot>
              <RowSlot w={160} hideOnMobile>連絡先</RowSlot>
              {/* **表頭は空でも `placeholder` の「—」を出さない。**
                  `RowSlot` の既定は「値が無い」を「—」で示す仕組みで、見出しの列名にも
                  同じ判定が働くと、権限が無くて列を隠しているだけなのに
                  「データが無い」と見えてしまう（実ブラウザで確認して直した）。 */}
              <RowSlot w={160} hideOnMobile placeholder="">{canReadBudget ? "インボイス番号" : ""}</RowSlot>
              <RowSlot w={160} hideOnMobile>関連ページ</RowSlot>
              <RowSlot w={128} placeholder="">{canManage ? "操作" : ""}</RowSlot>
            </RowHeader>

            {items.map((c) => {
              // **編集そのものを止める。** サーバーは `budget:editor` を持たない
              // `sales:owner` に、仕入先を兼ねる会社の**どの項目の保存も** 403 で
              // 拒む（名前・電話番号だけの修正も）。出したまま押させて 403 に
              // 気づかせるより、押せない理由をここで先に言う
              const editBlockedByVendor = c.is_vendor && !canEditVendor;
              const canEditThis = canManage && !editBlockedByVendor;
              return (
                <Row
                  key={c.id}
                  divider
                  stackOnMobile
                  interactive={canEditThis}
                  onClick={canEditThis ? () => openEdit(c) : undefined}
                >
                  <RowMain>
                    <span className="flex items-center gap-1.5">
                      <RowTitle className="truncate">{c.name}</RowTitle>
                      {/* **グループは役割の列に混ぜない** — 顧客・仕入先とは別の軸なので、
                          混ぜると「グループという役割がある」と読まれる */}
                      {c.is_gmo_group && <TableBadge label="グループ" w={null} variant="info" />}
                    </span>
                    <RowSub>{c.short_name || c.contact_name || c.email || "—"}</RowSub>
                  </RowMain>
                  <RowSlot w={200}><RoleBadges c={c} /></RowSlot>
                  <RowSlot w={160} hideOnMobile className="flex-col items-start">
                    <span className="truncate text-sub text-secondary-foreground">{c.contact_name || "—"}</span>
                    <span className="truncate text-sub-sm text-muted-foreground">{c.email || c.phone || ""}</span>
                  </RowSlot>
                  {/* `!canReadBudget` のときは値が無いのではなく列が見えないだけ。
                      `placeholder=""` にして既定の「—」を出さない（表頭と同じ理由） */}
                  <RowSlot w={160} hideOnMobile placeholder={canReadBudget ? undefined : ""}>
                    {canReadBudget ? (
                      <span className="truncate text-sub text-muted-foreground">{c.invoice_registration_number || "—"}</span>
                    ) : ""}
                  </RowSlot>
                  <RowSlot w={160} hideOnMobile>
                    <span className="flex flex-col gap-0.5">
                      {c.customer_id && (
                        <button
                          type="button"
                          className="flex items-center gap-0.5 text-sub-sm text-primary hover:underline"
                          onClick={(e) => { e.stopPropagation(); navigate(`/sales/customers/${c.id}`); }}
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />取引実績
                        </button>
                      )}
                      {c.vendor_id && canReadBudget && (
                        <button
                          type="button"
                          className="flex items-center gap-0.5 text-sub-sm text-primary hover:underline"
                          onClick={(e) => { e.stopPropagation(); navigate("/budget/vendors"); }}
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />仕入先ページ
                        </button>
                      )}
                    </span>
                  </RowSlot>
                  <RowSlot w={128}>
                    {canManage && (
                      <span className="flex gap-0.5">
                        <Button
                          variant="ghost" size="icon" title="収支サマリー"
                          onClick={(e) => { e.stopPropagation(); setSummaryTarget(c); }}
                        >
                          <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" aria-label="編集"
                          disabled={editBlockedByVendor}
                          title={editBlockedByVendor ? "仕入先を兼ねているため、財務管理の編集権限が無いと直せません" : "編集"}
                          onClick={(e) => { e.stopPropagation(); if (canEditThis) openEdit(c); }}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost" size="icon" aria-label="削除" className="text-destructive"
                            onClick={(e) => { e.stopPropagation(); onDelete(c); }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </span>
                    )}
                  </RowSlot>
                </Row>
              );
            })}
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
