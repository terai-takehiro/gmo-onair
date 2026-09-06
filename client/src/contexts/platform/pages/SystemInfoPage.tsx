/**
 * システムの情報（v4・設定トップの脚注から来る）
 *
 * ── 旧「システム設定」の中身をここへ移した ──────────────────
 *
 * `/settings` は **v4 で「設定の入口を1枚にまとめた案内板」** になりました
 * （`SettingsHubPage`）。それまで `/settings` に出ていた
 * アプリのバージョン・全データバックアップ・パスワード変更・アプリ一覧は
 * **毎日使うものではない**ので、こちらへ移してあります。
 *
 * ── 権限を掛けていない ──────────────────────────────────────
 *
 * 旧 `/settings` は `admin` 権限が要りました。そのため
 * **パスワードを変えたい人が管理者しか来られませんでした**。
 * この画面は**ログインしていれば誰でも開けます** — 中の
 * 全データバックアップだけが `system_admin` に限定されます
 * （出す/出さないはカードごとに判定する）。
 *
 * 中身は移しただけで作り替えていません（生の色指定だけトークンに直しました）。
 *
 * ── ネイティブ級の見た目に作り直した回（v4-native-ui-plan）─────
 *
 * 監査（docs/v4-native-ui-audit-2026-08-20.md）で見つかった3つの不足を直した:
 * ①ブロックアプリ一覧が生の `<table>` を横スクロール任せで出していた
 * ②パスワード変更フォームが `max-w-sm` という PC 都合の幅だけを持っていた
 * ③各セクションが shadcn の汎用 `Card` の縦積みで、
 *   通知/拠点/権限など他の設定画面が既に使っている
 *   「小見出し ＋ `rounded-card` の枠 ＋ 罫線区切りの行」（iOS のグループ化リストと同じ形）
 *   に揃っていなかった
 *
 * → アプリ情報・全データバックアップ・パスワード変更・ブロックアプリ一覧の
 * 4セクションを、他の v4 設定画面（`NotifyPage` / `SitesPage` / `MoneyRulesPage` /
 * `MembersPage`）と同じ「小見出し + `rounded-card` + `divide` 行」の形に合わせた。
 * **PC とスマホで別レイアウトを作っていない** — 罫線区切りの行は幅が変わっても
 * 崩れないので、`useIsMobile()` を足さずに済んでいる（このページはそもそも
 * 早期 return が要る分岐を持たない）。
 * `IntegrationsCard` / `AiUsageCard` / `ActivityFormatCard` は表を持つ別ファイルで
 * 監査の指摘に入っていないため、この回では触っていない。
 */
import { useState } from "react";
import { Database, Download, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { useAuth } from "@/contexts/platform/AuthContext";
import { APPS } from "@gmo-onair/shared/src/client/apps";
import api from "@/lib/api";
import { IntegrationsCard } from "./settings/IntegrationsCard";
import { AiUsageCard } from "./settings/AiUsageCard";
import { ActivityFormatCard } from "./settings/ActivityFormatCard";

/** 小見出し（枠の外・グレーの字間広め）。iOS のグループ化リストと同じ位置に置く */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-note pl-1 flex items-center gap-1.5 font-bold tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

export default function SystemInfoPage() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";

  const downloadBackup = async () => {
    const res = await api.get("/admin/backup.xlsx", { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `gmo-onair_backup_${today}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="システムの情報"
        sub="いま動いているアプリの版と、取り出せるデータ。毎日は使いません"
      />

      {/* アプリ情報。iOS の「情報」画面と同じ形（行＝ラベルと値、罫線で区切る） */}
      <section className="flex flex-col gap-2">
        <SectionLabel>アプリ情報</SectionLabel>
        <div className="rounded-card overflow-hidden border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border-faint px-4 py-3">
            <span className="text-list text-muted-foreground">アプリ名</span>
            <span className="text-list font-bold">GMO ONAiR</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-list text-muted-foreground">バージョン</span>
            {/* ルート package.json 由来 (vite.config.ts の define)。HomePage と同じソース。
                client/package.json を import すると、バージョン更新のたびに
                Docker の build-client 以外のステージまでキャッシュが飛ぶため使わない。 */}
            <span className="font-number text-list font-bold">v{__APP_VERSION__}</span>
          </div>
        </div>
      </section>

      {/* 外部サービスにつながっているか。**アプリ情報のすぐ下**に置く —
          「動かない」と気づいた人が最初に見る場所だから（下に置くと見つからない） */}
      <IntegrationsCard />

      {/* **つながっているかのすぐ下**に置く — 「使えている / いくら掛かっている」は
          続けて見るもの。離すと、費用を確かめに来た人がここまで来ない */}
      <AiUsageCard />

      {/* 取り込んだやり取りの本文を後から整える（migration 187） */}
      <ActivityFormatCard />

      {/* 管理者専用: 全データバックアップ */}
      {isAdmin && (
        <section className="flex flex-col gap-2">
          <SectionLabel>
            全データバックアップ
            <Badge variant="secondary" className="text-badge">管理者専用</Badge>
          </SectionLabel>
          <div className="rounded-card flex flex-col gap-3 border border-border bg-card p-4">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                ユーザー・顧客・案件・売上・仕入・販管費・機材・スタジオ予約等、主要13テーブルを
                日本語ヘッダー付きの単一xlsxファイルとして出力します（バックアップ・監査用）。
              </span>
            </p>
            <Button type="button" onClick={downloadBackup} className="self-start">
              <Download className="mr-1 h-4 w-4" aria-hidden="true" />
              バックアップを取得
            </Button>
          </div>
        </section>
      )}

      {/* パスワード変更 */}
      <ChangePasswordCard />

      {/* ブロックアプリ一覧。生の `<table>` を横スクロール任せで出していたのをやめ、
          他の設定画面と同じグループ化リスト（`rounded-card` + 罫線区切りの行）にした。
          幅が変わっても行として自然に折り返すので、375px でも横スクロールが要らない */}
      <section className="flex flex-col gap-2">
        <SectionLabel>ブロックアプリ一覧</SectionLabel>
        <div className="rounded-card overflow-hidden border border-border bg-card">
          {/* アプリ登録 (shared/src/client/apps.ts) が唯一の正 (S1/S4) */}
          {APPS.filter((app) => app.key !== "home").map((app) => (
            <div
              key={app.key}
              className="flex items-center gap-3 border-b border-border-faint px-4 py-3 last:border-b-0"
            >
              <span
                className="rounded-control-lg flex h-9 w-9 shrink-0 items-center justify-center"
                style={{ backgroundColor: `${app.color}1a` }}
              >
                <app.icon className="h-4 w-4" style={{ color: app.color }} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-list block truncate">{app.label}</span>
                <span className="text-note block truncate text-muted-foreground">{app.path}</span>
              </span>
              <span className="shrink-0">
                {app.comingSoon ? (
                  <Badge variant="secondary">準備中</Badge>
                ) : app.frozen ? (
                  <Badge variant="outline">v4.0.0 では据え置き</Badge>
                ) : (
                  <Badge className="bg-success text-white">有効</Badge>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (newPw.length < 8) { setMsg({ type: "err", text: "新しいパスワードは8文字以上です" }); return; }
    if (newPw !== confirmPw) { setMsg({ type: "err", text: "パスワードが一致しません" }); return; }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { current_password: currentPw, new_password: newPw });
      setMsg({ type: "ok", text: "パスワードを変更しました" });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err: any) {
      setMsg({ type: "err", text: err.response?.data?.error?.message || "パスワードを変更できませんでした。もう一度お試しください。" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        パスワード変更
      </SectionLabel>
      <div className="rounded-card border border-border bg-card p-4">
        {/* **スマホは画面いっぱい、PC だけ幅を絞る。** `max-w-sm` だけを持たせると
            「PC でちょうどよい幅」がそのままスマホにも掛かり、狭い画面向けに
            考え直した跡がない見た目になる（監査の指摘）。この画面の PC/スマホの
            境目も他の v4 部品と同じ `lg`（1024px）に揃えている */}
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3.5 lg:max-w-sm">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cur-pw">現在のパスワード</Label>
            <Input id="cur-pw" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required autoComplete="current-password" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-pw">新しいパスワード (8文字以上)</Label>
            <Input id="new-pw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cfm-pw">新しいパスワード (確認)</Label>
            <Input id="cfm-pw" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required autoComplete="new-password" />
          </div>
          {msg && (
            <div className={`flex items-center gap-2 text-sm ${msg.type === "ok" ? "text-success" : "text-destructive"}`}>
              {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertCircle className="h-4 w-4" aria-hidden="true" />}
              {msg.text}
            </div>
          )}
          <Button type="submit" disabled={loading} className="self-start">{loading ? "変更中…" : "パスワードを変更"}</Button>
        </form>
      </div>
    </section>
  );
}
