/**
 * 香盤表 — 案件 ＞ 香盤表 (デザイン 21章 28a / 仕様書 §7.8)
 *
 * 当日の動きを1枚にする。縦が時間、横が「誰・どの部屋」。
 *
 * ── この画面の決めごと ────────────────────────────────
 *  - **白紙から作らない**。案件の日程・予約・Qシート・機材から最初の1枚が入る
 *  - **1時間 88px** の目盛り（30分枠でも2行が収まる寸法）。px はここで掛けるだけで、
 *    枠は分で持っている（目盛りを変えても枠がずれない）
 *  - 重なっているところは**サーバーが数えて返す**（印刷とPDFで違う警告が出ないように）
 *  - レーンの出し入れは**消さずに隠す**（消すと置いた枠も消える）
 *  - 枠の長さがそのまま**計時LIVEのタイマーの尺**になる（当日作り直さない）
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NoticeBar, setNotice } from "@gmo-onair/shared/src/client/ui/notice";
import { ErrorPanel, SkeletonCard } from "@gmo-onair/shared/src/client/states";
import { useAuth } from "@/contexts/platform/AuthContext";
import {
  ArrowLeft, RefreshCw, Timer, AlertTriangle, Plus, X, Printer, Eye, EyeOff, Loader2, BookOpen,
} from "lucide-react";

interface Lane {
  id: string; kind: string; name: string; sub: string | null;
  internal_only: boolean; visible: boolean;
}
interface Block {
  id: string; lane_id: string; label: string;
  start_min: number; end_min: number | null;
  category: string; source: string; origin_kind: string | null;
  start_label: string; end_label: string | null;
  note: string | null;
}
interface Sheet {
  id: string; project_id: string; project_name: string; sheet_date: string;
  title: string | null; start_hour: number; end_hour: number; venue_close: string | null;
  hour_px: number;
  categories: Array<{ key: string; label: string }>;
  sources: Array<{ from: string; to: string }>;
  lanes: Lane[];
  blocks: Block[];
  warnings: string[];
}

/** 枠の色。カテゴリごとに固定 (デザイン 28a の色分け) */
const CAT_STYLE: Record<string, string> = {
  setup: "border-l-muted-foreground bg-muted/40 text-foreground",
  rehearsal: "border-l-warning bg-warning/10 text-warning-strong",
  performance: "border-l-negative bg-negative/10 text-negative",
  break: "border-l-divider bg-card text-muted-foreground",
  audience: "border-l-positive bg-positive/10 text-positive",
  move: "border-l-primary bg-primary/10 text-primary",
  teardown: "border-l-muted-foreground bg-muted/40 text-foreground",
};

export default function CallSheetPage() {
  const { id: projectId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("sales", "editor");

  const [sp, setSp] = useSearchParams();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState({ lane_id: "", label: "", start: "", end: "", category: "setup" });

  // 案件のこの日の1枚。無ければ作って自動で組む
  const { data: listData } = useQuery<{ data: any[] }>({
    queryKey: ["call-sheets", projectId],
    queryFn: async () => (await api.get(`/call-sheets/projects/${projectId}`)).data,
  });
  const sheets = useMemo(() => listData?.data ?? [], [listData]);
  const sheetId = sp.get("sheet") ?? sheets[0]?.id ?? null;

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: Sheet }>({
    queryKey: ["call-sheet", sheetId],
    queryFn: async () => (await api.get(`/call-sheets/${sheetId}`)).data,
    enabled: !!sheetId,
  });
  const sheet = data?.data;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["call-sheet", sheetId] });
    qc.invalidateQueries({ queryKey: ["call-sheets", projectId] });
  };
  const onError = (e: any) => setNotice({
    tone: "error", title: e?.response?.data?.error?.message ?? "できませんでした",
  });

  const create = useMutation({
    mutationFn: async (date: string) =>
      (await api.post(`/call-sheets/projects/${projectId}`, { sheet_date: date })).data,
    onSuccess: async (res: any) => {
      await invalidate();
      const next = new URLSearchParams(sp);
      next.set("sheet", res.data.id);
      setSp(next, { replace: true });
      setNotice({
        tone: "success", title: "最初の1枚を組みました",
        description: "入っている予定を並べたものです。ここから直してください。",
      });
    },
    onError,
  });
  const rebuild = useMutation({
    mutationFn: async () => (await api.post(`/call-sheets/${sheetId}/rebuild`)).data,
    onSuccess: async () => {
      await invalidate();
      setNotice({
        tone: "success", title: "元データから組み直しました",
        description: "手で置いた枠はそのままです。",
      });
    },
    onError,
  });
  const putBlock = useMutation({
    mutationFn: async (body: any) => (await api.put(`/call-sheets/${sheetId}/blocks`, body)).data,
    onSuccess: async () => {
      setDraft({ lane_id: "", label: "", start: "", end: "", category: "setup" });
      await invalidate();
    },
    onError,
  });
  const delBlock = useMutation({
    mutationFn: async (bid: string) => (await api.delete(`/call-sheets/${sheetId}/blocks/${bid}`)).data,
    onSuccess: async () => { await invalidate(); },
    onError,
  });
  const toggleLane = useMutation({
    mutationFn: async (v: { laneId: string; visible: boolean }) =>
      (await api.put(`/call-sheets/${sheetId}/lanes/${v.laneId}/visible`, { visible: v.visible })).data,
    onSuccess: async () => { await invalidate(); },
    onError,
  });
  const toTimer = useMutation({
    mutationFn: async () =>
      (await api.post(`/call-sheets/${sheetId}/to-timer`, { block_ids: [...picked] })).data,
    onSuccess: async (res: any) => {
      setPicked(new Set());
      setNotice({
        tone: "success",
        title: `${res.data.count}件を計時LIVEのタイマーにしました`,
        description: "枠の長さがそのまま尺です。当日タイマーを作り直す必要はありません。",
      });
    },
    onError,
  });

  const toMin = (s: string): number | null => {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };

  if (sheets.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <NoticeBar />
        <Button variant="ghost" size="sm" className="min-h-[44px] gap-1"
          onClick={() => navigate(`/sales/projects/${projectId}`)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          案件へ戻る
        </Button>
        <h1 className="text-xl font-bold">香盤表</h1>
        <p className="text-sm text-muted-foreground">
          いま Excel で作っているものです。案件に日程・予約・Qシート・機材が入っているので、
          <strong>最初の1枚は自動で組めます</strong>。白紙から作りません。
        </p>
        {canEdit && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-divider bg-card p-4">
            <label className="block">
              <span className="text-sm font-medium">どの日の分をつくりますか</span>
              <Input type="date" className="mt-1 w-44" aria-label="香盤表の日付"
                onChange={(e) => e.target.value && create.mutate(e.target.value)} />
            </label>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          </div>
        )}
      </div>
    );
  }

  if (isLoading || !sheet) {
    if (isError) {
      return <div className="p-4"><ErrorPanel title="香盤表を読めませんでした" error={error} onRetry={() => refetch()} /></div>;
    }
    return <div className="p-4"><SkeletonCard /></div>;
  }

  const visibleLanes = sheet.lanes.filter((l) => l.visible);
  const hours = Array.from(
    { length: Math.max(1, sheet.end_hour - sheet.start_hour) },
    (_, i) => sheet.start_hour + i,
  );
  const originMin = sheet.start_hour * 60;
  const px = (min: number) => ((min - originMin) / 60) * sheet.hour_px;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 sm:p-6">
      <NoticeBar />

      <Button variant="ghost" size="sm" className="min-h-[44px] gap-1 sm:hidden"
        onClick={() => navigate(`/sales/projects/${projectId}`)}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        案件へ戻る
      </Button>
      <nav className="hidden items-center gap-1 text-sm text-muted-foreground sm:flex" aria-label="いまいる場所">
        <button className="hover:underline" onClick={() => navigate("/projects")}>案件</button>
        <span aria-hidden="true">＞</span>
        <button className="hover:underline" onClick={() => navigate(`/sales/projects/${projectId}`)}>
          {sheet.project_name}
        </button>
        <span aria-hidden="true">＞</span>
        <span>香盤表</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">香盤表</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sheet.sheet_date} ・ レーン {visibleLanes.length}本 ・ 枠 {sheet.blocks.length}件
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sheets.length > 1 && (
            <select className="min-h-[44px] rounded-xl border border-divider bg-card px-2 text-sm"
              aria-label="日を選ぶ" value={sheetId ?? ""}
              onChange={(e) => { const n = new URLSearchParams(sp); n.set("sheet", e.target.value); setSp(n, { replace: true }); }}>
              {sheets.map((s: any) => <option key={s.id} value={s.id}>{s.sheet_date}</option>)}
            </select>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" className="min-h-[44px] gap-1"
              disabled={rebuild.isPending} onClick={() => rebuild.mutate()}>
              {rebuild.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              元データから組み直す
            </Button>
          )}
          <Button variant="outline" size="sm" className="min-h-[44px] gap-1" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            A3横で印刷
          </Button>
          {/* 香盤表は運営マニュアルの部品の1つ (22章)。そのまま束ねに行ける */}
          <Button variant="outline" size="sm" className="min-h-[44px] gap-1"
            onClick={() => navigate(`/sales/projects/${projectId}/manual`)}>
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            運営マニュアルに入れる
          </Button>
        </div>
      </header>

      {/* 重なっているところ */}
      {sheet.warnings.length > 0 && (
        <section className="rounded-xl bg-warning/10 p-3">
          <p className="flex items-center gap-1 text-sm font-bold">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            重なっているところ {sheet.warnings.length}件
          </p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {sheet.warnings.map((w) => <li key={w}>・{w}</li>)}
          </ul>
        </section>
      )}

      {/* レーンの出し入れ */}
      <section className="rounded-xl border border-divider bg-card p-3">
        <p className="text-sm font-bold">レーンの出し入れ</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {sheet.lanes.map((l) => (
            <button key={l.id} type="button" disabled={!canEdit}
              onClick={() => toggleLane.mutate({ laneId: l.id, visible: !l.visible })}
              aria-pressed={l.visible}
              className={`flex min-h-[44px] items-center gap-1 rounded-full border px-3 text-sm ${
                l.visible ? "border-primary bg-primary text-primary-foreground" : "border-divider bg-card text-muted-foreground"
              }`}>
              {l.visible ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
              {l.name}
              {l.internal_only && <span className="text-[11px] opacity-80">社内</span>}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          お客様に渡す版では、社内のレーン（テクニカル・運営）を隠して出せます。消さずに隠すので、置いた枠は残ります。
        </p>
      </section>

      {/* 時間 × レーンの表 */}
      <section className="overflow-x-auto rounded-xl border border-divider bg-card">
        <div className="flex min-w-[720px]">
          {/* 時間の目盛り */}
          <div className="w-16 shrink-0 border-r border-divider">
            <div className="h-10 border-b border-divider px-2 py-2 text-xs font-bold">時間</div>
            {hours.map((h) => (
              <div key={h} className="border-b border-row px-2 text-xs text-muted-foreground"
                style={{ height: sheet.hour_px }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {/* レーン */}
          {visibleLanes.map((l) => (
            <div key={l.id} className="min-w-[140px] flex-1 border-r border-divider last:border-0">
              <div className="h-10 border-b border-divider px-2 py-1">
                <div className="truncate text-xs font-bold">{l.name}</div>
                {l.sub && <div className="truncate text-[11px] text-muted-foreground">{l.sub}</div>}
              </div>
              <div className="relative" style={{ height: hours.length * sheet.hour_px }}>
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-b border-row"
                    style={{ top: (h - sheet.start_hour) * sheet.hour_px, height: sheet.hour_px }} />
                ))}
                {sheet.blocks.filter((b) => b.lane_id === l.id).map((b) => {
                  const top = px(b.start_min);
                  const h = b.end_min == null ? 28 : Math.max(22, px(b.end_min) - top);
                  return (
                    <div key={b.id}
                      className={`absolute inset-x-1 overflow-hidden rounded-lg border border-l-4 px-1.5 py-0.5 text-[11px] ${
                        CAT_STYLE[b.category] ?? CAT_STYLE.setup
                      }`}
                      style={{ top, height: h }}>
                      <div className="font-bold">
                        {b.start_label}{b.end_label ? `-${b.end_label}` : ""}
                      </div>
                      <div className="truncate">{b.label}</div>
                      {canEdit && b.source === "manual" && (
                        <button type="button" aria-label={`${b.label} を消す`}
                          className="absolute right-0.5 top-0.5 rounded p-0.5 hover:bg-black/5"
                          onClick={() => delBlock.mutate(b.id)}>
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                      {canEdit && b.end_min != null && (
                        <label className="absolute bottom-0.5 right-0.5 flex min-h-[20px] min-w-[20px] items-center justify-center">
                          <input type="checkbox" className="h-3.5 w-3.5"
                            aria-label={`${b.label} をタイマーにする`}
                            checked={picked.has(b.id)}
                            onChange={() => {
                              const n = new Set(picked);
                              if (n.has(b.id)) n.delete(b.id); else n.add(b.id);
                              setPicked(n);
                            }} />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 計時LIVEに渡す */}
      {canEdit && (
        <section className="rounded-xl border border-divider bg-card p-3">
          <p className="text-sm font-bold">計時LIVEに渡す</p>
          <p className="mt-1 text-xs text-muted-foreground">
            枠の長さがそのままタイマーの尺になります。当日はタイマーを作り直しません。
          </p>
          <Button size="sm" className="mt-2 min-h-[44px] gap-1"
            disabled={picked.size === 0 || toTimer.isPending}
            onClick={() => toTimer.mutate()}>
            {toTimer.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Timer className="h-4 w-4" aria-hidden="true" />}
            この{picked.size}枠をタイマーにする
          </Button>
        </section>
      )}

      {/* 枠を置く */}
      {canEdit && (
        <section className="rounded-xl border border-divider bg-card p-3">
          <p className="text-sm font-bold">枠を置く</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-xs text-muted-foreground">どのレーン</span>
              <select className="mt-1 block min-h-[44px] rounded-xl border border-divider bg-card px-2 text-sm"
                aria-label="どのレーンに置くか" value={draft.lane_id}
                onChange={(e) => setDraft({ ...draft, lane_id: e.target.value })}>
                <option value="">選んでください</option>
                {visibleLanes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">何をする</span>
              <Input className="mt-1 w-44" aria-label="何をするか" placeholder="流れ確認"
                value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">始まり</span>
              <Input className="mt-1 w-24" aria-label="始まりの時刻" placeholder="14:30"
                value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">終わり</span>
              <Input className="mt-1 w-24" aria-label="終わりの時刻" placeholder="16:30"
                value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">種類</span>
              <select className="mt-1 block min-h-[44px] rounded-xl border border-divider bg-card px-2 text-sm"
                aria-label="枠の種類" value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {sheet.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <Button size="sm" className="min-h-[44px] gap-1"
              disabled={!draft.lane_id || !draft.label.trim() || toMin(draft.start) == null || putBlock.isPending}
              onClick={() => putBlock.mutate({
                lane_id: draft.lane_id, label: draft.label,
                start_min: toMin(draft.start), end_min: toMin(draft.end),
                category: draft.category,
              })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              置く
            </Button>
          </div>
        </section>
      )}

      {/* どこから来たか */}
      <section className="rounded-xl border border-divider bg-card p-3">
        <p className="text-sm font-bold">最初の1枚はここから入ります</p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {sheet.sources.map((s) => (
            <li key={s.from}><strong className="text-foreground">{s.from}</strong> — {s.to}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          白紙から作りません。入っている予定を並べたものが最初に出て、そこから直します。
        </p>
      </section>
    </div>
  );
}
