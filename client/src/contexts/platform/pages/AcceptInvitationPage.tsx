import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, CheckCircle2, Lock } from "lucide-react";

export default function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const { data: invitation, isLoading, error: fetchError } = useQuery({
    queryKey: ["invitation", token],
    queryFn: async () => (await api.get("/auth/invitation", { params: { token } })).data.data as { name: string; email: string },
    enabled: !!token,
    retry: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("パスワードは8文字以上で入力してください"); return; }
    if (password !== confirm) { setError("パスワードが一致しません"); return; }
    setLoading(true);
    try {
      await api.post("/auth/accept-invitation", { token, password });
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (fetchError || !invitation) return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h2 className="text-lg font-bold mb-2">無効な招待リンク</h2>
          <p className="text-sm text-muted-foreground">
            {(fetchError as any)?.response?.data?.error?.message || "この招待リンクは無効または期限切れです。管理者にお問い合わせください。"}
          </p>
        </CardContent>
      </Card>
    </div>
  );

  if (done) return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
          <h2 className="text-lg font-bold mb-2">アカウント有効化完了</h2>
          <p className="text-sm text-muted-foreground mb-4">パスワードが設定されました。ログインしてください。</p>
          <Button type="button" onClick={() => navigate("/login", { replace: true })} className="w-full">ログインへ</Button>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-primary">GMO ONAiR</h1>
          <p className="text-sm text-muted-foreground mt-1">アカウント有効化</p>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 text-center">
              <p className="font-semibold">{invitation.name} 様</p>
              <p className="text-sm text-muted-foreground">{invitation.email}</p>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" /><span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="pw" className="flex items-center gap-1.5 mb-1.5">
                  <Lock className="h-3.5 w-3.5" />パスワード
                </Label>
                <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="8文字以上" required minLength={8} autoComplete="new-password" />
              </div>
              <div>
                <Label htmlFor="pw2">パスワード (確認)</Label>
                <Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再入力" required autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                パスワードを設定
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
