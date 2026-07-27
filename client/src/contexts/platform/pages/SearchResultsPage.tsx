/**
 * 検索結果の画面 — デザイン 36章
 *
 * ⌘K は「1つ選んで飛ぶ」ための場所なので候補を10件で切っている。
 * **たくさん出たときに見比べる場所**がこれ。
 *
 * ── 画面の決めごと ──────────────────────────────────────
 *
 *  - **見えないものは件数にも出さない**。権限が無い種類はタブごと出さず、
 *    「見る権限がないので探していません」と種類の名前だけ書く。
 *    「案件 0件」と出すと「無い」と読めてしまうが、実際は「見せてもらえない」
 *  - **何で探せるかを先に書く**（案件名・GLS番号…）。当たらないときに
 *    「言い方が悪いのか、無いのか」が分からないため
 *  - 出しているのが全部でないときは、**全部で何件あるか**を書く
 *    (「50件中の50件」なのか「50件ちょうど」なのかが分からないと絞り込めない)
 */
import { useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronRight, Lock } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorPanel, SkeletonCard } from '@gmo-onair/shared/src/client/states';
import { PROJECT_STAGE, statusOf } from "@gmo-onair/shared/src/constants/statuses";

interface Group {
  key: string;
  label: string;
  count: number;
  shown?: number;
  items: Record<string, unknown>[];
}
interface Results {
  q: string;
  kinds: Array<{ key: string; label: string; fields: string }>;
  hidden_kinds: Array<{ key: string; label: string; module: string }>;
  groups: Group[];
  total: number;
  empty_reason: string | null;
}

const str = (v: unknown) => (v == null ? "" : String(v));

/** 1件をどう出すか。種類ごとに「名前・2行目・番号・行き先」を決める */
function rowOf(kind: string, r: Record<string, unknown>) {
  switch (kind) {
    case "projects":
      return {
        name: str(r.name),
        sub: r.customer_name ? str(r.customer_name) : "お客様が未設定",
        code: r.gls_number ? str(r.gls_number) : (r.code ? str(r.code) : ""),
        badge: r.stage ? statusOf(PROJECT_STAGE, str(r.stage)).label : "",
        path: `/sales/projects/${r.id}`,
        external: false,
      };
    case "customers":
      return {
        name: str(r.name), sub: r.short_name ? str(r.short_name) : "お客様",
        code: "", badge: "", path: `/customers/${r.id}`, external: false,
      };
    case "vendors":
      return {
        name: str(r.name), sub: r.vendor_type ? str(r.vendor_type) : "仕入先",
        code: "", badge: "", path: "/budget/vendors", external: false,
      };
    case "equipment":
      return {
        name: str(r.name), sub: r.model_number ? str(r.model_number) : "機材",
        code: r.eq_code ? str(r.eq_code) : "", badge: "",
        path: "/equipment/", external: true,
      };
    default:
      return { name: str(r.name), sub: "", code: "", badge: "", path: "", external: false };
  }
}

export default function SearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get("q") ?? "";
  const kind = params.get("kind") ?? "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["search-results", q, kind],
    queryFn: async () =>
      (await api.get("/search/results", { params: { q, kind: kind || undefined } })).data.data as Results,
    enabled: q.trim().length > 0,
  });

  const setKind = (k: string) => {
    const next = new URLSearchParams(params);
    if (k) next.set("kind", k); else next.delete("kind");
    setParams(next, { replace: true });
  };

  const fields = useMemo(
    () => (data?.kinds ?? []).map((k) => `${k.label}（${k.fields}）`).join(" / "),
    [data],
  );

  const go = (path: string, external: boolean) => {
    if (!path) return;
    if (external) { window.open(path, "_blank", "noopener"); return; }
    navigate(path);
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-lg font-bold">
        <Search className="h-5 w-5" aria-hidden="true" />
        さがす
      </h1>

      {/* 探す言葉 */}
      <form className="mt-3 flex gap-2" onSubmit={(e) => e.preventDefault()}>
        <input
          value={q}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            next.set("q", e.target.value);
            setParams(next, { replace: true });
          }}
          aria-label="さがす言葉"
          placeholder="案件名・GLS番号・お客様の名前"
          className="min-h-tap flex-1 rounded-lg border bg-background px-3 text-sm"
        />
      </form>
      {fields && (
        <p className="mt-1 text-xs text-muted-foreground">探せるもの: {fields}</p>
      )}

      {/* 権限で外した種類。**件数は出さず名前だけ** */}
      {(data?.hidden_kinds?.length ?? 0) > 0 && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {data!.hidden_kinds.map((h) => h.label).join("・")} は見る権限がないので探していません。
          必要なときは管理者に権限を頼んでください。
        </p>
      )}

      {q.trim().length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="探したい言葉を入れてください"
            description="案件名・GLS番号・お客様の名前で探せます。⌘K からも同じものが探せます。"
          />
        </div>
      ) : isLoading ? (
        <div className="mt-4"><SkeletonCard lines={5} /></div>
      ) : error ? (
        <div className="mt-4"><ErrorPanel title="さがせませんでした" error={error} /></div>
      ) : !data ? null : (
        <>
          {/* 種類のタブ。**権限が無い種類はここに出さない** */}
          <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="さがす種類">
            <button type="button" role="tab" aria-selected={kind === ""}
              onClick={() => setKind("")}
              className={cn("min-h-[40px] rounded-lg border px-3 text-sm",
                kind === "" ? "border-primary bg-primary/10 font-bold text-primary" : "hover:bg-muted")}>
              すべて {data.total}件
            </button>
            {data.kinds.map((k) => {
              const g = data.groups.find((x) => x.key === k.key);
              return (
                <button key={k.key} type="button" role="tab" aria-selected={kind === k.key}
                  onClick={() => setKind(k.key)}
                  className={cn("min-h-[40px] rounded-lg border px-3 text-sm",
                    kind === k.key ? "border-primary bg-primary/10 font-bold text-primary" : "hover:bg-muted")}>
                  {k.label}{g ? ` ${g.count}件` : ""}
                </button>
              );
            })}
          </div>

          {data.total === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={<Search className="h-6 w-6" />}
                title="見つかりませんでした"
                description={data.empty_reason ?? "別の言い方で探してください。"}
              />
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              {data.groups.filter((g) => g.items.length > 0).map((g) => (
                <section key={g.key}>
                  <h2 className="mb-2 flex items-baseline gap-2 text-sm font-bold">
                    {g.label}
                    <span className="text-xs font-normal text-muted-foreground">
                      {g.count}件
                      {typeof g.shown === "number" && g.shown < g.count && (
                        <> 中 {g.shown}件を出しています（絞り込んでください）</>
                      )}
                    </span>
                  </h2>
                  <ul className="space-y-1.5">
                    {g.items.map((raw, i) => {
                      const r = rowOf(g.key, raw);
                      return (
                        <li key={`${g.key}-${str(raw.id) || i}`}>
                          <button type="button" onClick={() => go(r.path, r.external)}
                          className="flex min-h-tap w-full items-center gap-3 rounded-xl border bg-card px-3 py-2 text-left hover:bg-muted">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold">{r.name}</span>
                              {r.sub && (
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{r.sub}</span>
                              )}
                            </span>
                            {r.code && (
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{r.code}</span>
                            )}
                            {r.badge && (
                              <span className="shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                                {r.badge}
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
