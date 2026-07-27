/**
 * CustomerListPage — お客様一覧 (§4.9 / デザイン 11a)
 *
 * 住所録をやめて「取引の状態」が見える一覧にした。
 * 列 = 会社・担当者 / 累計売上 / 案件 (進行中・全体) / 最終接点 / 次の一手。
 *
 * 見出しに **全 N社・今年取引あり N社・30日以上ご無沙汰 N社** を出し、
 * 「ご無沙汰のみ」で絞り込める (`?stale=1`)。
 * 行をクリックすると顧客360 (`/customers/:id`) を開く。
 *
 * 「取引先マスター (請求先・支払条件)」は各社の中の「請求先」タブに統合した。
 * 同じ会社の情報を2か所で持たない。
 */
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Plus, Sparkles, ChevronRight, Building2 } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@gmo-onair/shared/src/client/ui/pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import ExcelToolbar from "@/components/ExcelToolbar";
import { useAuth } from "@/contexts/platform/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

interface CustomerRow {
  id: string;
  name: string;
  short_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  confirmed_revenue?: number | string | null;
  project_total?: number | string | null;
  project_active?: number | string | null;
  last_contact_date?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  is_ai_created?: boolean;
  ai_requested_by?: string | null;
}

interface Summary {
  total?: number | string;
  traded_this_year?: number | string;
  stale?: number | string;
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const today = () => new Date().toISOString().slice(0, 10);

/** 「12日前」のように経過で書く。日付そのものより「どれだけご無沙汰か」が読みたい */
function sinceLabel(date?: string | null): { text: string; stale: boolean } {
  if (!date) return { text: "接点なし", stale: false };
  const d = Math.floor((Date.parse(today()) - Date.parse(date)) / 86_400_000);
  if (d <= 0) return { text: "今日", stale: false };
  if (d === 1) return { text: "昨日", stale: false };
  if (d < 30) return { text: `${d}日前`, stale: false };
  if (d < 365) return { text: `${d}日前`, stale: true };
  return { text: `${Math.floor(d / 365)}年以上前`, stale: true };
}

function mdLabel(date?: string | null) {
  if (!date) return "";
  const [, m, d] = date.split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : date;
}

export default function CustomerListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("sales", "manager");
  const [sp, setSp] = useSearchParams();
  const [search, setSearch] = useState(sp.get("search") ?? "");
  const [adding, setAdding] = useState(false);

  const stale = sp.get("stale") === "1";
  const page = Number(sp.get("page") ?? 1) || 1;
  const limit = 30;

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setSp(next, { replace: true });
  };

  const q = useQuery({
    queryKey: ["customers", { page, limit, search: sp.get("search") ?? "", stale }],
    queryFn: async () =>
      (
        await api.get("/customers", {
          params: { page, limit, ...(sp.get("search") ? { search: sp.get("search") } : {}), ...(stale ? { stale: 1 } : {}) },
        })
      ).data,
    placeholderData: (prev) => prev,
  });

  const rows: CustomerRow[] = q.data?.data ?? [];
  const summary: Summary = q.data?.summary ?? {};
  const total = q.data?.pagination?.total ?? 0;
  const totalPages = q.data?.pagination?.totalPages ?? 1;

  const form = useForm<{ name: string; contact_name: string; email: string; phone: string }>({
    defaultValues: { name: "", contact_name: "", email: "", phone: "" },
  });

  const submit = form.handleSubmit(async (v) => {
    if (!v.name.trim()) return;
    const res = await api.post("/customers", v);
    setAdding(false);
    form.reset();
    qc.invalidateQueries({ queryKey: ["customers"] });
    const id = res.data?.data?.id;
    if (id) navigate(`/customers/${id}`);
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-screen-2xl space-y-4 px-4 py-5 sm:py-7">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <PageTitle>お客様</PageTitle>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-secondary-foreground">
              全 <span className="font-bold tabular-nums text-foreground">{n(summary.total)}社</span>
              <span aria-hidden="true">・</span>
              今年取引あり <span className="font-bold tabular-nums text-foreground">{n(summary.traded_this_year)}社</span>
              <span aria-hidden="true">・</span>
              <span className={cn(n(summary.stale) > 0 && "text-warning-strong")}>
                30日以上ご無沙汰 <span className="font-bold tabular-nums">{n(summary.stale)}社</span>
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExcelToolbar resource="/customers" name="顧客" queryKey={["customers"]} />
            {canEdit && (
              <Button className="gap-1.5" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                お客様を足す
              </Button>
            )}
          </div>
        </header>

        {/* さがす + 絞り込み */}
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="min-w-0 flex-1 sm:max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              set({ search, page: null });
            }}
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => set({ search, page: null })}
              placeholder="会社名・担当者名でさがす"
            />
          </form>
          <button
            type="button"
            onClick={() => set({ stale: stale ? null : "1", page: null })}
            aria-pressed={stale}
            className={cn(
              "rounded-control border px-3 py-2 text-[13px] transition-colors",
              stale
                ? "border-warning-strong bg-warning-surface font-bold text-warning-strong"
                : "border-border text-secondary-foreground hover:bg-secondary"
            )}
          >
            ご無沙汰のみ
          </button>
        </div>

        {/* 一覧 */}
        {q.isError ? (
          <ErrorPanel title="お客様の一覧を読み込めませんでした" error={q.error} onRetry={() => void q.refetch()} />
        ) : q.isLoading ? (
          <Delayed>
            <SkeletonRows rows={6} />
          </Delayed>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-6 w-6" aria-hidden="true" />}
            title={stale ? "ご無沙汰のお客様はいません" : "お客様がまだ登録されていません"}
            description={
              stale
                ? "30日以内に何らかの接点があります。"
                : "案件をつくると相手の会社が必要になります。ここで先に登録できます。"
            }
            action={canEdit ? <Button onClick={() => setAdding(true)}>お客様を足す</Button> : undefined}
          />
        ) : (
          <>
            {/* PC: 表 */}
            <div className="hidden overflow-hidden rounded-lg border border-border bg-card sm:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-divider text-[12px] text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">会社・担当者</th>
                    <th className="px-3 py-2.5 text-right font-medium">累計売上</th>
                    <th className="px-3 py-2.5 text-right font-medium">案件</th>
                    <th className="px-3 py-2.5 font-medium">最終接点</th>
                    <th className="px-3 py-2.5 font-medium">次の一手</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {rows.map((c) => (
                    <Row key={c.id} c={c} onOpen={() => navigate(`/customers/${c.id}`)} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* スマホ: カード */}
            <ul className="space-y-2 sm:hidden">
              {rows.map((c) => {
                const since = sinceLabel(c.last_contact_date);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/customers/${c.id}`)}
                      className="flex w-full items-start gap-2 rounded-lg border border-border bg-card px-3 py-3 text-left"
                    >
                      <Initial name={c.name} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 truncate text-[15px] font-bold text-foreground">{c.name}</span>
                          {c.is_ai_created && <AiBadge requestedBy={c.ai_requested_by} />}
                        </span>
                        {c.contact_name && (
                          <span className="mt-0.5 block truncate text-[12px] text-secondary-foreground">{c.contact_name}</span>
                        )}
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-secondary-foreground">
                          <span className="tabular-nums">{formatCurrency(n(c.confirmed_revenue))}</span>
                          <span aria-hidden="true">・</span>
                          <span>案件 {n(c.project_total)}件{n(c.project_active) > 0 ? `（進行中 ${n(c.project_active)}）` : ""}</span>
                          <span aria-hidden="true">・</span>
                          <span className={cn(since.stale && "font-bold text-warning-strong")}>{since.text}</span>
                        </span>
                        {c.next_action && (
                          <span className="mt-1 block truncate text-[12px] text-foreground">
                            次: {mdLabel(c.next_action_date)} {c.next_action}
                          </span>
                        )}
                      </span>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                onChange={(p) => set({ page: String(p) })}
              />
            )}
          </>
        )}

        <p className="text-[12px] text-muted-foreground">
          請求先・支払条件は各社の中の「請求先」タブにあります。同じ会社の情報を2か所で持ちません。
        </p>

        {/* お客様を足す */}
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>お客様を足す</DialogTitle>
              <DialogDescription>会社名だけで登録できます。残りは後からこのお客様の画面で足せます。</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="space-y-3"
            >
              <div>
                <Label htmlFor="cu-name">会社名 *</Label>
                <Input id="cu-name" {...form.register("name", { required: true })} placeholder="株式会社◯◯" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cu-contact">担当者</Label>
                  <Input id="cu-contact" {...form.register("contact_name")} />
                </div>
                <div>
                  <Label htmlFor="cu-phone">電話</Label>
                  <Input id="cu-phone" {...form.register("phone")} />
                </div>
              </div>
              <div>
                <Label htmlFor="cu-email">メール</Label>
                <Input id="cu-email" type="email" {...form.register("email")} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                  やめる
                </Button>
                <Button type="submit">登録する</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

      </div>
    </PageTransition>
  );
}

function Row({ c, onOpen }: { c: CustomerRow; onOpen: () => void }) {
  const since = sinceLabel(c.last_contact_date);
  const overdue = !!c.next_action_date && c.next_action_date < today();
  return (
    <tr className="cursor-pointer transition-colors hover:bg-secondary/60" onClick={onOpen}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Initial name={c.name} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-bold text-foreground">{c.name}</span>
              {c.is_ai_created && <AiBadge requestedBy={c.ai_requested_by} />}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-secondary-foreground">
              {c.contact_name || "担当者 未登録"}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-right text-[14px] font-bold tabular-nums text-foreground">
        {n(c.confirmed_revenue) > 0 ? formatCurrency(n(c.confirmed_revenue)) : <span className="font-normal text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-3 text-right text-[13px] tabular-nums text-foreground">
        {n(c.project_total) > 0 ? (
          <>
            {n(c.project_total)}件
            {n(c.project_active) > 0 && (
              <span className="ml-1 text-[12px] text-primary">進行中 {n(c.project_active)}</span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className={cn("px-3 py-3 text-[13px]", since.stale ? "font-bold text-warning-strong" : "text-secondary-foreground")}>
        {since.text}
      </td>
      <td className="max-w-[260px] px-3 py-3 text-[13px]">
        {c.next_action ? (
          <span className={cn("block truncate", overdue ? "font-bold text-destructive" : "text-foreground")}>
            {mdLabel(c.next_action_date)} {c.next_action}
            {overdue && "（期限を過ぎています）"}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="pr-3">
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </td>
    </tr>
  );
}

function Initial({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[13px] font-bold text-secondary-foreground"
    >
      {name.replace(/^(株式会社|有限会社|合同会社|一般社団法人)/, "").trim().slice(0, 1) || "・"}
    </span>
  );
}

function AiBadge({ requestedBy }: { requestedBy?: string | null }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-ai-border bg-ai-surface px-1.5 py-0.5 text-[10px] font-bold text-ai"
      title={requestedBy ? `AI が登録しました（指示: ${requestedBy}）` : "AI が登録しました"}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      AI作成
    </span>
  );
}
