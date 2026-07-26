/**
 * この人にできること (§4.17 / デザイン 20b)
 *
 * 従来は 10 モジュール × 4 段階のプルダウンを 1 つずつ選ぶダイアログだった。
 * 実際の運用は「営業の人」「経理の人」で決まっているのに、毎回 10 行を手で当てていたため
 * **人によって微妙に違う権限**ができ、あとで「なぜこの人だけ見えないのか」が分からなくなる。
 *
 * ここでは **役割テンプレートを先に当てて、必要な行だけ直す**形にした。
 * 右にその人に見えるレールを出すのは、権限の結果が「何が見えるか」でしか確認できないため
 * (モジュール名の一覧を眺めても、その人の画面がどうなるかは分からない)。
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Check, Loader2, ShieldCheck, Users, Info, Save, Clock,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@gmo-onair/shared/src/client/dashboard";
import { ErrorPanel } from "@gmo-onair/shared/src/client/states";
import { resolveRailItems } from "@gmo-onair/shared/src/client/shell/railItems";
import { useAuth, MODULE_LABELS } from "@/contexts/platform/AuthContext";
import { cn } from "@/lib/utils";

interface PermissionChange {
  id: string;
  module: string;
  before_level: string | null;
  after_level: string | null;
  source: string;
  changed_at: string;
  actor_name: string | null;
}

/** 画面に出す 4 段階。DB の値 (reader/editor/manager) と 1:1 で対応する */
const LEVELS = [
  { id: "none", label: "見えない", hint: "メニューにも出ない" },
  { id: "reader", label: "見るだけ", hint: "開けるが直せない" },
  { id: "editor", label: "書ける", hint: "追加・編集できる" },
  { id: "manager", label: "任せる", hint: "削除・設定もできる" },
] as const;
type LevelId = (typeof LEVELS)[number]["id"];

const LEVEL_STYLE: Record<LevelId, string> = {
  none: "bg-muted text-muted-foreground",
  reader: "bg-sky-100 text-sky-800",
  editor: "bg-violet-100 text-violet-800",
  manager: "bg-amber-100 text-amber-800",
};

/** 権限ダイアログと同じ順序 (増えたモジュールはここに足す) */
const MODULES = [
  "sales", "budget", "studio", "partner_schedule", "equipment",
  "qsheet", "techsheet", "liveops", "awards", "dailyops",
] as const;

/** 金額が見えるモジュール (注意書きに使う) */
const MONEY_MODULES = new Set(["sales", "budget"]);

/**
 * 役割テンプレート。
 * 「その職種の人が普段どこまで触るか」を並べたもので、当てたあとに行ごとに直せる。
 */
const TEMPLATES: { id: string; label: string; desc: string; perms: Partial<Record<string, LevelId>> }[] = [
  {
    id: "sales",
    label: "営業",
    desc: "案件・お客様・お金を動かす。現場の道具は見るだけ",
    perms: {
      sales: "editor", budget: "editor", studio: "editor", partner_schedule: "editor",
      equipment: "reader", qsheet: "reader", techsheet: "reader", liveops: "reader",
      awards: "reader", dailyops: "editor",
    },
  },
  {
    id: "production",
    label: "制作・技術",
    desc: "本番の道具を動かす。金額は見るだけ",
    perms: {
      sales: "reader", studio: "editor", partner_schedule: "editor", equipment: "editor",
      qsheet: "editor", techsheet: "editor", liveops: "editor", awards: "editor",
      dailyops: "editor",
    },
  },
  {
    id: "partner",
    label: "外部パートナー",
    desc: "自分が担当する案件の台本と予定だけ",
    perms: { qsheet: "editor", techsheet: "reader", studio: "reader" },
  },
  {
    id: "finance",
    label: "経理",
    desc: "お金を締める。案件は見るだけ",
    perms: { sales: "reader", budget: "manager", dailyops: "editor" },
  },
  {
    id: "admin",
    label: "管理者",
    desc: "全部を任せる",
    perms: {
      sales: "manager", budget: "manager", studio: "manager", partner_schedule: "manager",
      equipment: "manager", qsheet: "manager", techsheet: "manager", liveops: "manager",
      awards: "manager", dailyops: "manager",
    },
  },
];

/** DB に残る旧レベルを画面の 4 段階に寄せる (v2.9.x の repair-permissions と同じ対応) */
function normalize(level: string | undefined): LevelId {
  if (!level) return "none";
  if (level === "exporter") return "reader";
  if (level === "owner") return "manager";
  if (level === "reader" || level === "editor" || level === "manager") return level;
  return "none";
}

/** 履歴の「見えない → 書ける」表示。NULL = その時点で権限なし */
function levelLabel(level: string | null): string {
  const id = normalize(level ?? undefined);
  return LEVELS.find((l) => l.id === id)?.label ?? id;
}

/** `template:sales` → 「営業」 (消えたテンプレートIDはそのまま出す) */
function templateName(source: string): string {
  const id = source.slice("template:".length);
  return TEMPLATES.find((t) => t.id === id)?.label ?? id;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  phone?: string;
}

function elapsed(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "今日";
  if (days === 1) return "昨日";
  if (days < 31) return `${days}日前`;
  return d.toLocaleDateString("ja-JP");
}

export default function UserPermissionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser, permissions: myPerms } = useAuth();
  const myRole = currentUser?.role;
  const canEdit = myRole === "system_admin" || !!myPerms?._all;

  const { data: user, isLoading: userLoading, isError: userError, refetch } = useQuery<UserRow>({
    queryKey: ["user", id],
    queryFn: async () => (await api.get(`/users/${id}`)).data.data,
    enabled: !!id,
  });

  const { data: perms, isLoading: permsLoading } = useQuery<{ module: string; access_level: string; updated_at?: string }[]>({
    queryKey: ["user-permissions", id],
    queryFn: async () => (await api.get(`/users/${id}/permissions`)).data.data,
    enabled: !!id,
  });

  const [draft, setDraft] = useState<Record<string, LevelId>>({});
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);

  // サーバーの値が来たら下書きを作り直す (自分の編集中は上書きしない)
  useEffect(() => {
    if (!perms) return;
    const map: Record<string, LevelId> = {};
    for (const m of MODULES) map[m] = "none";
    for (const p of perms) map[p.module] = normalize(p.access_level);
    setDraft(map);
    setAppliedTemplate(null);
  }, [perms]);

  const savedMap = useMemo(() => {
    const map: Record<string, LevelId> = {};
    for (const m of MODULES) map[m] = "none";
    for (const p of perms ?? []) map[p.module] = normalize(p.access_level);
    return map;
  }, [perms]);

  const changed = useMemo(
    () => MODULES.filter((m) => (draft[m] ?? "none") !== savedMap[m]),
    [draft, savedMap]
  );

  const updatedAtByModule = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const p of perms ?? []) map[p.module] = p.updated_at;
    return map;
  }, [perms]);

  // 変更履歴 (誰が・いつ・どの行を どう変えたか)
  const { data: history } = useQuery<PermissionChange[]>({
    queryKey: ["user-permission-history", id],
    queryFn: async () => (await api.get(`/users/${id}/permission-history?limit=100`)).data.data,
    enabled: !!id,
    refetchOnMount: "always",
  });

  const save = useMutation({
    mutationFn: async () => {
      const permissions: Record<string, string | null> = {};
      for (const m of MODULES) permissions[m] = draft[m] && draft[m] !== "none" ? draft[m] : null;
      // 役割テンプレートを当てた保存かどうかを履歴に残す
      // (「営業のテンプレートを当てた」のか「1行だけ直した」のかで読み方が変わる)
      await api.put(`/users/${id}/permissions`, {
        permissions,
        source: appliedTemplate ? `template:${appliedTemplate}` : "manual",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-permissions", id] });
      qc.invalidateQueries({ queryKey: ["user-permission-history", id] });
    },
  });

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    const next: Record<string, LevelId> = {};
    for (const m of MODULES) next[m] = (t.perms[m] as LevelId | undefined) ?? "none";
    setDraft(next);
    setAppliedTemplate(t.id);
  };

  // 右のプレビューは下書きで作る (保存前に「何が見えるようになるか」を確かめられる)
  const railPreview = useMemo(() => {
    const asPerms: Record<string, string> = {};
    for (const m of MODULES) if (draft[m] && draft[m] !== "none") asPerms[m] = draft[m];
    return resolveRailItems({ role: user?.role, permissions: asPerms });
  }, [draft, user?.role]);

  const isTargetAdmin = user?.role === "system_admin";

  if (userLoading || permsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (userError || !user) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorPanel title="この人の情報を開けませんでした" error={null} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/settings/users")} aria-label="人と権限に戻る">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-black text-foreground">{user.name}</h1>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
              isTargetAdmin ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            {isTargetAdmin ? "システム管理者" : "スタッフ"}
          </span>
          {canEdit && !isTargetAdmin && (
            <Button
              size="sm"
              className="gap-1"
              disabled={changed.length === 0 || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {changed.length > 0 ? `${changed.length}件を保存` : "変更なし"}
            </Button>
          )}
        </div>
      </div>

      {isTargetAdmin && (
        <p className="rounded-control border border-destructive/40 bg-destructive-surface p-3 text-xs leading-relaxed text-foreground">
          この人はシステム管理者なので、**すべての画面が見えます**。個別の権限は使われません。
          範囲を絞るには「人と権限」の一覧で役割をスタッフに変えてください。
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* 左: テンプレート + 行ごとの調整 */}
        <div className="space-y-4">
          <SectionCard
            icon={<Users />}
            title="役割で当てる"
            description="まずここを押して、そのあと下の行で足りない・多すぎるところだけ直します"
          >
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={!canEdit || isTargetAdmin}
                  onClick={() => applyTemplate(t)}
                  aria-pressed={appliedTemplate === t.id}
                  className={cn(
                    "min-w-[140px] flex-1 rounded-control border p-2.5 text-left transition-colors disabled:opacity-50",
                    appliedTemplate === t.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:bg-accent"
                  )}
                >
                  <span className="flex items-center gap-1 text-sm font-bold text-foreground">
                    {appliedTemplate === t.id && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
                    {t.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{t.desc}</span>
                </button>
              ))}
            </div>
            {appliedTemplate && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                当てただけで、まだ保存していません。右上の「保存」を押すまで変わりません。
              </p>
            )}
          </SectionCard>

          <SectionCard
            icon={<ShieldCheck />}
            title="1つずつ直す"
            description={`${LEVELS.map((l) => l.label).join(" / ")} の4段階。「見えない」はメニューにも出しません`}
          >
            <div className="divide-y divide-divider">
              {MODULES.map((mod) => {
                const cur = draft[mod] ?? "none";
                const isChanged = cur !== savedMap[mod];
                const when = elapsed(updatedAtByModule[mod]);
                return (
                  <div key={mod} className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="min-w-[132px] flex-1">
                      <span className="text-sm font-bold text-foreground">
                        {MODULE_LABELS[mod] ?? mod}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        {MONEY_MODULES.has(mod) && <span>金額が見えます</span>}
                        {when && (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="h-3 w-3" aria-hidden />
                            {when}に変更
                          </span>
                        )}
                        {isChanged && <span className="font-bold text-warning-strong">未保存</span>}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      {LEVELS.map((lv) => (
                        <button
                          key={lv.id}
                          type="button"
                          disabled={!canEdit || isTargetAdmin}
                          onClick={() => { setDraft((p) => ({ ...p, [mod]: lv.id })); setAppliedTemplate(null); }}
                          aria-pressed={cur === lv.id}
                          title={lv.hint}
                          className={cn(
                            "min-h-[32px] rounded-control border px-2.5 text-[11px] transition-colors disabled:opacity-50",
                            cur === lv.id
                              ? `border-transparent font-bold ${LEVEL_STYLE[lv.id]}`
                              : "border-border bg-card text-muted-foreground hover:bg-accent"
                          )}
                        >
                          {lv.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>

        {/* 右: 結果のプレビューと注意 */}
        <div className="space-y-4">
          <SectionCard
            icon={<Users />}
            title="この人に見えるレール"
            description="いまの設定で保存したときの左のメニュー"
          >
            <ul className="space-y-1">
              {railPreview.map((r) => (
                <li key={r.key} className="flex items-center gap-2 rounded-control bg-muted/50 px-2.5 py-1.5">
                  <r.Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="text-sm font-medium text-foreground">{r.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              「今日」と「設定」は権限を問わず出ます (待たせているものは職種を問わず見るため)。
            </p>
          </SectionCard>

          <SectionCard icon={<Info />} title="気をつけること">
            <ul className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
              <li>
                <span className="font-bold text-foreground">金額の見え方</span> —
                案件と お金 に「見るだけ」以上を付けると、売上・仕入・粗利の金額が見えます。
                金額を見せたくない人はここを「見えない」にしてください。
              </li>
              <li>
                <span className="font-bold text-foreground">案件メンバーは権限とは別軸</span> —
                ここで決めるのは「どのアプリを触れるか」で、<span className="font-bold">どの案件のものが見えるか</span>は
                案件の担当メンバーで決まります。担当している案件のQシートは、Qシートの権限があれば
                共有設定をしなくても開けます。自分に割り当てられたタスクは案件の権限が無くても出ますが、金額は返しません。
              </li>
              <li>
                <span className="font-bold text-foreground">2要素認証</span> —
                本番のログインは SMS の確認コードが要ります。ここでは変えられません。
              </li>
              <li>
                <span className="font-bold text-foreground">変更の記録</span> —
                この下に「誰が・いつ・どの行を どう変えたか」が残ります。
                <span className="font-bold">記録を始めたのは v2.9.270 からなので、それより前の変更は残っていません。</span>
              </li>
            </ul>
          </SectionCard>

          {/* 変更履歴 — 「なぜこの人だけ見えないのか」を後から追うための台帳 */}
          <SectionCard
            title="変更の記録"
            description="誰が・いつ・どの行を どう変えたか。消せません。"
            icon={<Clock className="h-4 w-4" aria-hidden="true" />}
          >
            {(history ?? []).length === 0 ? (
              <p className="text-[13px] text-secondary-foreground">
                まだ記録がありません。記録を始めたのは v2.9.270 からなので、
                それより前に変えた分は残っていません（「変更が無かった」ではありません）。
              </p>
            ) : (
              <ul className="divide-y divide-divider">
                {(history ?? []).map((h) => (
                  <li key={h.id} className="py-2 first:pt-0 last:pb-0">
                    <p className="flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
                      <span className="font-bold text-foreground">
                        {MODULE_LABELS[h.module] ?? h.module}
                      </span>
                      <span className="text-secondary-foreground">
                        {levelLabel(h.before_level)} → <span className="font-bold text-foreground">{levelLabel(h.after_level)}</span>
                      </span>
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {new Date(h.changed_at).toLocaleString("ja-JP")}
                      {h.actor_name ? ` ／ ${h.actor_name}` : ""}
                      {h.source.startsWith("template:")
                        ? ` ／ ${templateName(h.source)}のテンプレートを当てた`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
