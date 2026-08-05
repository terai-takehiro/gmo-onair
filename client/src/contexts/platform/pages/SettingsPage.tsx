import { PageTransition } from "@/components/ui/motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/platform/AuthContext";
import { APPS } from "@gmo-onair/shared/src/client/apps";
import { Database, Download, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import api from "@/lib/api";
import { useState } from "react";

export default function SettingsPage() {
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
    <PageTransition>
      <div className="space-y-4 p-3 lg:space-y-6 lg:p-6">
        <h1 className="text-lg lg:text-2xl font-bold">システム設定</h1>

        {/* アプリ情報 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base lg:text-lg">アプリ情報</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">アプリ名</dt>
              <dd className="font-medium">GMO ONAiR</dd>
              <dt className="text-muted-foreground">バージョン</dt>
              {/* ルート package.json 由来 (vite.config.ts の define)。HomePage と同じソース。
                  client/package.json を import すると、バージョン更新のたびに
                  Docker の build-client 以外のステージまでキャッシュが飛ぶため使わない。 */}
              <dd className="font-medium">v{__APP_VERSION__}</dd>
            </dl>
          </CardContent>
        </Card>

        {/* 管理者専用: 全データバックアップ */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                <Database className="h-4 w-4" />
                全データバックアップ
                <Badge variant="secondary" className="text-[10px]">管理者専用</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                ユーザー・顧客・案件・売上・仕入・販管費・機材・スタジオ予約等、主要13テーブルを
                日本語ヘッダー付きの単一xlsxファイルとして出力します（バックアップ・監査用）。
              </p>
              <Button onClick={downloadBackup}>
                <Download className="h-4 w-4 mr-1" />
                バックアップを取得
              </Button>
            </CardContent>
          </Card>
        )}

        {/* パスワード変更 */}
        <ChangePasswordCard />

        {/* ブロックアプリ一覧 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base lg:text-lg">ブロックアプリ一覧</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">アプリ名</th>
                    <th className="pb-2 pr-4 font-medium">ステータス</th>
                    <th className="pb-2 font-medium">ベースパス</th>
                  </tr>
                </thead>
                <tbody>
                  {/* アプリ登録 (shared/src/client/apps.ts) が唯一の正 (S1/S4) */}
                  {APPS.filter((app) => app.key !== "home").map((app) => (
                    <tr key={app.key} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{app.label}</td>
                      <td className="py-2 pr-4">
                        {app.comingSoon ? (
                          <Badge variant="secondary">準備中</Badge>
                        ) : app.frozen ? (
                          <Badge variant="outline">v4.0.0 では据え置き</Badge>
                        ) : (
                          <Badge className="bg-green-500 text-white">有効</Badge>
                        )}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {app.path}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

      </div>
    </PageTransition>
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
      setMsg({ type: "err", text: err.response?.data?.error?.message || "変更に失敗しました" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base lg:text-lg flex items-center gap-2">
          <Lock className="h-4 w-4" />
          パスワード変更
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3 max-w-sm">
          <div>
            <Label htmlFor="cur-pw">現在のパスワード</Label>
            <Input id="cur-pw" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required autoComplete="current-password" />
          </div>
          <div>
            <Label htmlFor="new-pw">新しいパスワード (8文字以上)</Label>
            <Input id="new-pw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          <div>
            <Label htmlFor="cfm-pw">新しいパスワード (確認)</Label>
            <Input id="cfm-pw" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required autoComplete="new-password" />
          </div>
          {msg && (
            <div className={`flex items-center gap-2 text-sm ${msg.type === "ok" ? "text-green-600" : "text-destructive"}`}>
              {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {msg.text}
            </div>
          )}
          <Button type="submit" disabled={loading}>{loading ? "変更中..." : "パスワードを変更"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
