/**
 * 案件をつくる（起票） — デザイン 14章 27b / 仕様書 §7.1
 *
 * いまの案件フォームは1画面に22項目ある。**起票の瞬間に分かっているのは3つだけ**
 * (どこの・なんの話か / お客様 / スタジオを使うか) なので、聞くのはそれだけにする。
 * 電話を切った直後に15秒で終わることが目的。
 *
 * ── この画面の決めごと ────────────────────────────────
 *  - **項目を増やさない**。金額も日程も、決まった段で聞く (27c)
 *  - 案件名は**メモでよい**と明示する（「用賀 10月 発表会」で構わない）
 *  - お客様は**その場で作れる**（住所も電話も後で）
 *  - 「スタジオを使いますか」の1問で**あとから聞く項目が変わる**ことを画面に書く
 *  - GLS番号は採らない（受注が決まってから採る。先に採ると消えた案件の番号が空く）
 *  - 必須マークを増やさない。聞く瞬間に聞くので、そもそも空で進めない
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NoticeBar, setNotice } from "@gmo-onair/shared/src/client/ui/notice";
import { useAuth } from "@/contexts/platform/AuthContext";
import { Loader2, Check, Building2, ArrowLeft, Plus } from "lucide-react";

interface Customer { id: string; name: string; short_name?: string | null }

/** 「スタジオを使いますか」の2択。これで案件分類が決まる (人には分類を聞かない) */
const STUDIO_KINDS = [
  { uses: true, label: "使う", sub: "スタジオ案件" },
  { uses: false, label: "使わない", sub: "ビジネス案件（月次の請求など）" },
];

export default function ProjectIntakePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("sales", "editor");

  const [name, setName] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [usesStudio, setUsesStudio] = useState<boolean | null>(null);

  const { data: custData, isFetching: custFetching } = useQuery<{ data: Customer[] }>({
    queryKey: ["intake-customers", customerQuery],
    queryFn: async () =>
      (await api.get("/customers", { params: { search: customerQuery, limit: 8 } })).data,
    enabled: customerQuery.trim().length > 0 && !customerId,
  });
  const candidates = useMemo(() => custData?.data ?? [], [custData]);
  const exactMatch = candidates.some(
    (c) => c.name.trim() === customerQuery.trim(),
  );

  const pickedName = customerId
    ? candidates.find((c) => c.id === customerId)?.name ?? customerQuery
    : null;

  /** 初めてのお客様は、名前を打った時点でその場で作る (住所も電話も後で) */
  const createCustomer = useMutation({
    mutationFn: async () =>
      (await api.post("/customers", { name: customerQuery.trim() })).data,
    onSuccess: (res: any) => {
      setCustomerId(res.data.id);
      qc.invalidateQueries({ queryKey: ["intake-customers"] });
    },
    onError: (e: any) => setNotice({
      tone: "error", title: e?.response?.data?.error?.message ?? "お客様をつくれませんでした",
    }),
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post("/projects", {
        name: name.trim(),
        customer_id: customerId,
        uses_studio: usesStudio,
      })).data,
    onSuccess: (res: any) => {
      setNotice({
        tone: "success",
        title: "ネタとして登録しました",
        description: "日程・金額・書類は、進んだ段でその場で聞きます。",
      });
      navigate(`/sales/projects/${res.data.id}`);
    },
    onError: (e: any) => setNotice({
      tone: "error", title: e?.response?.data?.error?.message ?? "つくれませんでした",
    }),
  });

  const ready = name.trim().length > 0 && !!customerId && usesStudio !== null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
      <NoticeBar />

      {/* スマホではパンくずを並べず 44px の戻る1つにする */}
      <Button variant="ghost" size="sm" className="min-h-tap gap-1 sm:hidden"
        onClick={() => navigate("/projects")}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        案件へ戻る
      </Button>
      <nav className="hidden items-center gap-1 text-sm text-muted-foreground sm:flex" aria-label="いまいる場所">
        <button className="hover:underline" onClick={() => navigate("/projects")}>案件</button>
        <span aria-hidden="true">＞</span>
        <span>案件をつくる</span>
      </nav>

      <header>
        <h1 className="text-xl font-bold">案件をつくる</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          分かっていることだけ入れてください。<strong>金額も日程も、決まってから聞きます。</strong>
        </p>
      </header>

      {!canEdit && (
        <p className="rounded-xl border border-divider bg-muted/50 p-4 text-sm">
          案件をつくるには営業の編集権限が要ります。設定から依頼してください。
        </p>
      )}

      <section className="space-y-6 rounded-2xl border border-divider bg-card p-4 sm:p-6">
        {/* 1つめ: 案件名 */}
        <label className="block">
          <span className="text-sm font-bold">どこの、なんの話か</span>
          <Input className="mt-1" value={name} disabled={!canEdit}
            placeholder="秋のブランド発表会"
            onChange={(e) => setName(e.target.value)} />
          <span className="mt-1 block text-xs text-muted-foreground">
            あとで直せます。「用賀 10月 発表会」のようなメモでも構いません。
          </span>
        </label>

        {/* 2つめ: お客様 */}
        <div>
          <span className="text-sm font-bold">お客様</span>
          {customerId ? (
            <div className="mt-1 flex min-h-tap flex-wrap items-center gap-2 rounded-xl border border-divider bg-muted/40 px-3">
              <Check className="h-4 w-4 text-positive" aria-hidden="true" />
              <span className="text-sm font-medium">{pickedName}</span>
              <Button variant="ghost" size="sm" className="ml-auto min-h-tap"
                onClick={() => { setCustomerId(null); setCustomerQuery(""); }}>
                変える
              </Button>
            </div>
          ) : (
            <>
              <Input className="mt-1" value={customerQuery} disabled={!canEdit}
                placeholder="株式会社ミナトデジタル"
                onChange={(e) => setCustomerQuery(e.target.value)} />
              <span className="mt-1 block text-xs text-muted-foreground">
                初めてのお客様なら、名前を打つとその場で作れます（住所も電話も後で）。
              </span>
              {customerQuery.trim().length > 0 && (
                <ul className="mt-2 rounded-xl border border-divider">
                  {custFetching && (
                    <li className="p-3 text-sm text-muted-foreground">さがしています…</li>
                  )}
                  {candidates.map((c) => (
                    <li key={c.id} className="border-b border-row last:border-0">
                      <button type="button" disabled={!canEdit}
                        onClick={() => setCustomerId(c.id)}
                        className="flex min-h-tap w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40">
                        <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        {c.name}
                      </button>
                    </li>
                  ))}
                  {!custFetching && !exactMatch && (
                    <li className="border-t border-divider">
                      <button type="button" disabled={!canEdit || createCustomer.isPending}
                        onClick={() => createCustomer.mutate()}
                        className="flex min-h-tap w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-primary/5">
                        {createCustomer.isPending
                          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          : <Plus className="h-4 w-4" aria-hidden="true" />}
                        「{customerQuery.trim()}」をお客様としてつくる
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </>
          )}
        </div>

        {/* 3つめ: スタジオを使うか (これで案件分類が決まる) */}
        <div>
          <span className="text-sm font-bold">スタジオを使いますか</span>
          <div className="mt-1 grid gap-2 sm:grid-cols-2" role="group" aria-label="スタジオを使いますか">
            {STUDIO_KINDS.map((k) => (
              <button key={k.label} type="button" disabled={!canEdit}
                onClick={() => setUsesStudio(k.uses)}
                aria-pressed={usesStudio === k.uses}
                className={`min-h-tap rounded-xl border p-3 text-left ${
                  usesStudio === k.uses
                    ? "border-primary bg-primary/5"
                    : "border-divider hover:bg-muted/40"
                }`}>
                <span className="block font-medium">{k.label}</span>
                <span className="block text-xs text-muted-foreground">{k.sub}</span>
              </button>
            ))}
          </div>
          <span className="mt-1 block text-xs text-muted-foreground">
            この1問で、あとから聞く項目（部屋・本番日 か 月次の請求）が変わります。
          </span>
        </div>

        <div>
          <Button disabled={!canEdit || !ready || create.isPending}
            onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            つくる
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            ネタとして登録されます。GLS番号は受注が決まってから採ります
            （先に採ると、消えた案件の番号が空きます）。
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-divider bg-card p-4">
        <h2 className="text-sm font-bold">このあと聞くこと</h2>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>仮押さえにするとき — いつ、どの部屋を押さえますか（2問）</li>
          <li>見積提案にするとき — いくらで出しますか（1問）</li>
          <li>口頭決定にするとき — 聞くことはありません</li>
          <li>受注にするとき — 申込書とロゴの許諾は揃いましたか（2つ）</li>
          <li>失注にするとき — なぜ決まらなかったか（選ぶだけ）</li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          その瞬間に画面が出すので、いま覚えておく必要はありません。
        </p>
      </section>
    </div>
  );
}
