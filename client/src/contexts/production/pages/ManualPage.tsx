/**
 * 運営マニュアル — 案件 ＞ 運営マニュアル (デザイン 22章 29a/29b/29c / 仕様書 §7.8)
 *
 * いただいた PDF (31ページ) を分解すると、部品は12種だった。
 * **PDFを作る機能ではなく、部品を作って最後に束ねる機能**。3〜4時間 → 15分。
 *
 * ── この画面の決めごと ────────────────────────────────
 *  - できている部品を並べるだけ。**足りないものは名前で残る**（白紙のページを作らない）
 *  - **渡す相手で入る部品が変わる**（連絡先と原価は社外版から自動で外れる）
 *  - 配置図の記号はスタッフ表から。**凡例は勝手にできる**
 *  - **会場図はAIが下書き**して、人が実測と動線を直す
 *  - 出した版は変わらない（あとで部品を直しても配った版はそのまま）
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { NoticeBar, setNotice } from "@gmo-onair/shared/src/client/ui/notice";
import { ErrorPanel, SkeletonCard } from '@gmo-onair/shared/src/client/states';
import { useAuth } from "@/contexts/platform/AuthContext";
import {
  ArrowLeft, Printer, Sparkles, AlertTriangle, Check, Plus, X, Loader2, MapPin,
} from "lucide-react";

interface Part {
  kind: string; label: string; src: string; fill: string; from: string;
  internal_only: boolean; ready: boolean; ai_drafted: boolean; included: boolean;
  content: any;
}
interface ManualView {
  id: string; project_id: string; project_name: string; version: number;
  audience: string;
  audiences: Array<{ key: string; label: string; detail: string }>;
  out_rules: string[];
  scenes: Array<{ key: string; label: string }>;
  symbols: Array<{ mark: string; label: string }>;
  parts: Part[];
  toc: Array<{ no: number; kind: string; label: string; warn: boolean }>;
  not_ready: string[];
  not_ready_count: number;
  layouts: Array<{ id: string; scene: string; scene_label: string; item_count: number; ai_output_id: string | null }>;
  issues: Array<{ id: string; version: number; audience: string; page_count: number; issued_at: string }>;
}
interface LayoutView {
  id: string; scene: string; scene_label: string; ai_output_id: string | null;
  items: Array<{ id: string; mark: string; label: string; x: number; y: number; note: string | null }>;
  legend: Array<{ mark: string; label: string; count: number }>;
  symbols: Array<{ mark: string; label: string }>;
  ai?: { output_id: string; model: string; count: number; used_digest: boolean };
}

const FILL_LABEL: Record<string, string> = {
  auto: "自動", semi: "半自動", manual: "手で入れる", template: "定型から",
};

export default function ManualPage() {
  const { id: projectId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("sales", "editor");

  const [sp, setSp] = useSearchParams();
  const audience = sp.get("audience") ?? "internal";
  const scene = sp.get("scene") ?? "performance";
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp); n.set(k, v); setSp(n, { replace: true });
  };
  const [mark, setMark] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: ManualView }>({
    queryKey: ["manual", projectId, audience],
    queryFn: async () =>
      (await api.get(`/manuals/projects/${projectId}`, { params: { audience } })).data,
  });
  const manual = data?.data;

  const { data: layoutData } = useQuery<{ data: LayoutView }>({
    queryKey: ["manual-layout", manual?.id, scene],
    queryFn: async () => (await api.get(`/manuals/${manual!.id}/layouts/${scene}`)).data,
    enabled: !!manual?.id,
  });
  const layout = layoutData?.data;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["manual", projectId] });
    qc.invalidateQueries({ queryKey: ["manual-layout", manual?.id] });
  };
  const onError = (e: any) => setNotice({
    tone: "error", title: e?.response?.data?.error?.message ?? "できませんでした",
  });

  const savePart = useMutation({
    mutationFn: async (v: { kind: string; ready: boolean }) =>
      (await api.put(`/manuals/${manual!.id}/parts/${v.kind}`, { ready: v.ready })).data,
    onSuccess: async () => { await invalidate(); },
    onError,
  });
  const aiDraft = useMutation({
    mutationFn: async () => (await api.post(`/manuals/${manual!.id}/layouts/${scene}/ai-draft`)).data,
    onSuccess: async (res: any) => {
      await invalidate();
      setNotice({
        tone: "success",
        title: `AIが配置図を下書きしました（${res.data.ai?.count ?? 0}個）`,
        description: "実測はしていません。位置と動線を人が直してください。",
      });
    },
    onError,
  });
  const putItem = useMutation({
    mutationFn: async (body: any) =>
      (await api.put(`/manuals/${manual!.id}/layouts/${layout!.id}/items`, body)).data,
    onSuccess: async () => { setMark(""); await invalidate(); },
    onError,
  });
  const delItem = useMutation({
    mutationFn: async (itemId: string) =>
      (await api.delete(`/manuals/${manual!.id}/layouts/${layout!.id}/items/${itemId}`)).data,
    onSuccess: async () => { await invalidate(); },
    onError,
  });
  const issue = useMutation({
    mutationFn: async () => (await api.post(`/manuals/${manual!.id}/issue`, { audience })).data,
    onSuccess: async (res: any) => {
      await invalidate();
      const nr: string[] = res.data.not_ready ?? [];
      setNotice({
        tone: nr.length > 0 ? "warning" : "success",
        title: `第${res.data.version}版を出しました（${res.data.page_count}ページ）`,
        description: nr.length > 0
          ? `できていない部品に印を付けて出しました: ${nr.join(" / ")}`
          : "出した瞬間の中身を残しました。あとで部品を直しても、配った版は変わりません。",
      });
    },
    onError,
  });

  const notReadyParts = useMemo(
    () => (manual?.parts ?? []).filter((p) => p.included && !p.ready), [manual]);

  if (isLoading || !manual) {
    if (isError) {
      return <div className="p-4"><ErrorPanel title="運営マニュアルを読めませんでした" error={error} onRetry={() => refetch()} /></div>;
    }
    return <div className="p-4"><SkeletonCard /></div>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <NoticeBar />

      <Button variant="ghost" size="sm" className="min-h-tap gap-1 sm:hidden"
        onClick={() => navigate(`/sales/projects/${projectId}`)}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        案件へ戻る
      </Button>
      <nav className="hidden items-center gap-1 text-sm text-muted-foreground sm:flex" aria-label="いまいる場所">
        <button className="hover:underline" onClick={() => navigate("/projects")}>案件</button>
        <span aria-hidden="true">＞</span>
        <button className="hover:underline" onClick={() => navigate(`/sales/projects/${projectId}`)}>
          {manual.project_name}
        </button>
        <span aria-hidden="true">＞</span>
        <span>運営マニュアル</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">運営マニュアル</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            第{manual.version}版 ・ 全 {manual.toc.length}ページ ・
            {manual.not_ready_count > 0
              ? <span className="text-warning"> できていない部品 {manual.not_ready_count}</span>
              : <span className="text-positive"> 部品はすべて揃っています</span>}
          </p>
        </div>
        {canEdit && (
          <Button className="min-h-tap gap-1" disabled={issue.isPending}
            onClick={() => issue.mutate()}>
            {issue.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Printer className="h-4 w-4" aria-hidden="true" />}
            PDFにする
          </Button>
        )}
      </header>

      {/* 誰に渡す版か */}
      <section className="rounded-2xl border border-divider bg-card p-4">
        <h2 className="text-base font-bold">誰に渡す版か</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {manual.audiences.map((a) => (
            <button key={a.key} type="button"
              onClick={() => setParam("audience", a.key)}
              aria-pressed={audience === a.key}
              className={`min-h-tap rounded-xl border p-3 text-left ${
                audience === a.key ? "border-primary bg-primary/5" : "border-divider hover:bg-muted/40"
              }`}>
              <span className="block font-medium">{a.label}</span>
              <span className="block text-xs text-muted-foreground">{a.detail}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          連絡先と原価が入るページは、社外版から自動で外れます。
        </p>
      </section>

      {/* できていない部品 */}
      {notReadyParts.length > 0 && (
        <section className="rounded-xl bg-warning/10 p-3">
          <p className="flex items-center gap-1 text-sm font-bold">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            できていない部品 {notReadyParts.length}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {notReadyParts.map((p) => <li key={p.kind}>・{p.label}（{p.from}）</li>)}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            白紙にせず「これから作ります」と印を付けて出せます。
          </p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {/* 部品12種 */}
          <section className="rounded-2xl border border-divider bg-card">
            <h2 className="border-b border-divider p-4 text-base font-bold">この冊子の中身（部品12種）</h2>
            <ul>
              {manual.parts.map((p) => (
                <li key={p.kind}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-row p-3 last:border-0 ${
                    p.included ? "" : "opacity-50"
                  }`}>
                  {p.ready
                    ? <Check className="h-4 w-4 shrink-0 text-positive" aria-hidden="true" />
                    : <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{p.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.from}
                      {p.src !== "—" && <span className="pl-1">（元PDF {p.src}）</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{FILL_LABEL[p.fill]}</span>
                  {p.internal_only && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px]">社内のみ</span>
                  )}
                  {p.ai_drafted && (
                    <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-ai/10 px-2 py-0.5 text-[11px] text-ai">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />AIが下書き
                    </span>
                  )}
                  {!p.included && <span className="shrink-0 text-xs text-muted-foreground">この版には入りません</span>}
                  {canEdit && p.included && p.fill !== "auto" && (
                    <Button variant="ghost" size="sm" className="min-h-tap shrink-0"
                      onClick={() => savePart.mutate({ kind: p.kind, ready: !p.ready })}>
                      {p.ready ? "できていないに戻す" : "できたことにする"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* 配置図 (29c) */}
          <section className="rounded-2xl border border-divider bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">配置図（人と物を図に置く）</h2>
              <div className="flex gap-1 rounded-xl bg-muted p-1" role="group" aria-label="場面">
                {manual.scenes.map((s) => (
                  <button key={s.key} type="button" onClick={() => setParam("scene", s.key)}
                    aria-pressed={scene === s.key}
                    className={`min-h-[36px] rounded-lg px-2 text-sm ${
                      scene === s.key ? "bg-card font-medium shadow-sm" : "text-muted-foreground"
                    }`}>{s.label}</button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              記号はスタッフ表から。凡例は勝手にできます。場面ごとに1枚です。
            </p>

            {canEdit && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" className="min-h-tap gap-1"
                  disabled={aiDraft.isPending} onClick={() => aiDraft.mutate()}>
                  {aiDraft.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <Sparkles className="h-4 w-4 text-ai" aria-hidden="true" />}
                  AIに下書きさせる
                </Button>
                <span className="text-xs text-muted-foreground">
                  部屋の標準図とカメラ台数・出演者数から置きます。
                  <strong>実測はしていません</strong>ので、位置と動線は人が直してください。
                </span>
              </div>
            )}

            {layout && (
              <>
                {layout.ai_output_id && (
                  <p className="mt-3 flex items-center gap-1 rounded-xl bg-ai/5 p-2 text-xs">
                    <Sparkles className="h-3 w-3 text-ai" aria-hidden="true" />
                    この図はAIの下書きから始まっています。直した分は次の下書きに返ります。
                  </p>
                )}

                {/* 図 */}
                <div className="relative mt-3 aspect-[3/2] w-full overflow-hidden rounded-xl border border-divider bg-muted/30">
                  <div className="absolute inset-x-0 top-0 border-b border-divider bg-card/70 py-1 text-center text-xs text-muted-foreground">
                    ステージ ／ LED
                  </div>
                  {layout.items.map((i) => (
                    <div key={i.id}
                      className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5"
                      style={{ left: `${i.x / 10}%`, top: `${i.y / 10}%` }}>
                      <span title={i.note ?? undefined}
                        className="flex min-h-[24px] min-w-[24px] items-center justify-center rounded-lg bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                        {i.mark}
                      </span>
                      {canEdit && (
                        <button type="button" aria-label={`${i.label} を消す`}
                          className="rounded p-0.5 hover:bg-black/5"
                          onClick={() => delItem.mutate(i.id)}>
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                  {layout.items.length === 0 && (
                    <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                      まだ何も置かれていません
                    </p>
                  )}
                </div>

                {/* 凡例 (置いた記号から勝手にできる) */}
                <div className="mt-3">
                  <h3 className="text-sm font-bold">凡例</h3>
                  {layout.legend.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      記号を置くと、凡例も一緒にできます。
                    </p>
                  ) : (
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {layout.legend.map((l) => (
                        <li key={l.mark} className="flex items-center gap-1 rounded-lg border border-divider px-2 py-1 text-sm">
                          <span className="flex min-h-[20px] min-w-[20px] items-center justify-center rounded bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                            {l.mark}
                          </span>
                          {l.label}
                          <span className="text-xs text-muted-foreground">{l.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 置く */}
                {canEdit && (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="block">
                      <span className="text-xs text-muted-foreground">置くもの</span>
                      <select className="mt-1 block min-h-tap rounded-xl border border-divider bg-card px-2 text-sm"
                        aria-label="置く記号" value={mark} onChange={(e) => setMark(e.target.value)}>
                        <option value="">選んでください</option>
                        {layout.symbols.map((s) => (
                          <option key={s.mark} value={s.mark}>{s.mark} … {s.label}</option>
                        ))}
                      </select>
                    </label>
                    <Button size="sm" className="min-h-tap gap-1" disabled={!mark || putItem.isPending}
                      onClick={() => putItem.mutate({ mark, x: 500, y: 500 })}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      図の中央に置く
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      置いたあと位置を直します（記号を消すと凡例も減ります）。
                    </span>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        {/* 右 */}
        <aside className="space-y-4">
          {/* 目次 */}
          <section className="rounded-2xl border border-divider bg-card p-4">
            <h2 className="text-base font-bold">目次（この版）</h2>
            <ol className="mt-2 space-y-1 text-sm">
              {manual.toc.map((t) => (
                <li key={t.kind} className="flex items-center gap-2">
                  <span className="w-5 text-xs text-muted-foreground">{t.no}</span>
                  <span className={`min-w-0 flex-1 truncate ${t.warn ? "text-warning" : ""}`}>{t.label}</span>
                  {t.warn && <span className="shrink-0 text-[11px] text-warning">これから作ります</span>}
                </li>
              ))}
            </ol>
          </section>

          {/* 出すときの決まり */}
          <section className="rounded-2xl border border-divider bg-card p-4">
            <h2 className="text-base font-bold">出すときの決まり</h2>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {manual.out_rules.map((r) => (
                <li key={r} className="flex gap-1">
                  <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{r}
                </li>
              ))}
            </ul>
          </section>

          {/* 出した版 */}
          {manual.issues.length > 0 && (
            <section className="rounded-2xl border border-divider bg-card p-4">
              <h2 className="text-base font-bold">出した版</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {manual.issues.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-baseline gap-2 border-t border-row pt-1">
                    <span className="font-medium">第{i.version}版</span>
                    <span className="text-xs text-muted-foreground">
                      {manual.audiences.find((a) => a.key === i.audience)?.label ?? i.audience}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">{i.page_count}ページ</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                出した瞬間の中身を残しています。あとで部品を直しても、配った版は変わりません。
              </p>
            </section>
          )}

          <section className="rounded-2xl border border-divider bg-card p-4">
            <h2 className="flex items-center gap-1 text-base font-bold">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              決めたこと
            </h2>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>PDFを作る機能ではなく、部品を作って最後に束ねる機能です。</li>
              <li>足りない部品は名前で残します（白紙のページは作りません）。</li>
              <li>連絡先と原価は社外版から自動で外れます。</li>
              <li>記号はスタッフ表から。凡例は勝手にできます。</li>
              <li>会場図はAIが下書きし、実測と動線は人が直します。</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
