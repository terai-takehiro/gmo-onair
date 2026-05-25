import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "../AuthContext";
import { StaggerList, StaggerItem, LiftCard } from "@/components/ui/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, User, AlertCircle, Lock, Mail, Smartphone } from "lucide-react";

const roleLabelMap: Record<string, string> = {
  system_admin: "システム管理者",
  staff: "スタッフ",
};

/**
 * v2 SSO: redirect 先の安全な解決。
 * - 相対パス ("/foo") はそのまま許可
 * - 絶対 URL は **.gmo-onair.jp 系のみ** 許可 (cross-subdomain SSO 用)
 * - それ以外は "/" にフォールバック (Open Redirect 脆弱性回避)
 */
function resolveRedirect(raw: string | null): string {
  if (!raw) return '/';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '/';
    const host = u.hostname.toLowerCase();
    if (host === 'gmo-onair.jp' || host.endsWith('.gmo-onair.jp')) {
      return u.toString();
    }
  } catch { /* fall through */ }
  return '/';
}

export default function LoginPage() {
  const { login, loginWithToken } = useAuth();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const redirectPath = resolveRedirect(searchParams.get("redirect"));

  // Auth mode
  const { data: authMode } = useQuery({
    queryKey: ["auth-mode"],
    queryFn: async () => (await api.get("/auth/mode")).data.data as { mode: string },
  });

  // Mock mode users
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["auth-users"],
    queryFn: async () => (await api.get("/auth/users")).data.data as Array<{ id: string; name: string; email: string; role: string }>,
    enabled: authMode?.mode === "mock",
  });

  // Login form state
  const [step, setStep] = useState<"login" | "2fa">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [userId, setUserId] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      const data = res.data.data;
      if (data.requires_2fa) {
        setStep("2fa");
        setUserId(data.user_id);
        setPhoneMasked(data.phone_masked);
      } else {
        await loginWithToken(data.token);
        // resolveRedirect で .gmo-onair.jp 系絶対 URL も許可済み
      window.location.replace(redirectPath || "/");
      }
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/verify-2fa", { user_id: userId, code: otpCode });
      await loginWithToken(res.data.data.token);
      window.location.replace(redirectPath || "/");
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || "認証コードが正しくありません");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      await api.post("/auth/resend-otp", { user_id: userId });
      setFormError("");
    } catch { /* ignore */ }
  };

  const handleMockLogin = async (uid: string) => {
    await login(uid);
    window.location.replace(redirectPath || "/");
  };

  const isMock = authMode?.mode === "mock";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100">
      <div className="w-full max-w-md px-4">
        <div className="mb-8 text-center">
          <img
            src="/logo-onair.svg"
            alt="GMO ONAiR"
            className="mx-auto h-12 w-auto sm:h-16"
          />
          <p className="mt-2 text-base text-muted-foreground">統合業務管理システム</p>
        </div>

        {(error || formError) && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{formError || (error === "auth_failed" ? "認証に失敗しました" : "ログインエラー")}</span>
          </div>
        )}

        {/* Mock mode — dev user cards */}
        {isMock && (
          <>
            {usersLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : (
              <StaggerList className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-6">
                {users?.map((u) => (
                  <StaggerItem key={u.id}>
                    <LiftCard className="cursor-pointer rounded-lg border bg-card shadow-sm" onClick={() => handleMockLogin(u.id)}>
                      <CardContent className="flex items-center gap-3 p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          <Badge className="mt-0.5 text-[10px]">{roleLabelMap[u.role] || u.role}</Badge>
                        </div>
                      </CardContent>
                    </LiftCard>
                  </StaggerItem>
                ))}
              </StaggerList>
            )}
            <div className="relative my-4"><hr /><span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-br from-blue-50 to-slate-100 px-3 text-xs text-muted-foreground">または</span></div>
          </>
        )}

        {/* Email/Password login */}
        {step === "login" && (
          <Card>
            <CardContent className="p-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="email" className="flex items-center gap-1.5 mb-1.5">
                    <Mail className="h-3.5 w-3.5" />メールアドレス
                  </Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" required autoComplete="email" />
                </div>
                <div>
                  <Label htmlFor="password" className="flex items-center gap-1.5 mb-1.5">
                    <Lock className="h-3.5 w-3.5" />パスワード
                  </Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" required autoComplete="current-password" />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  ログイン
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* 2FA step */}
        {step === "2fa" && (
          <Card>
            <CardContent className="p-6">
              <div className="text-center mb-4">
                <Smartphone className="h-10 w-10 mx-auto text-primary mb-2" />
                <p className="text-sm text-muted-foreground">
                  <strong>{phoneMasked}</strong> に認証コードを送信しました
                </p>
              </div>
              <form onSubmit={handleVerify2fa} className="space-y-4">
                <div>
                  <Label htmlFor="otp">認証コード (6桁)</Label>
                  <Input id="otp" type="text" inputMode="numeric" maxLength={6}
                    value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000" required autoComplete="one-time-code"
                    className="text-center text-2xl tracking-[0.5em] " />
                </div>
                <Button type="submit" className="w-full" disabled={loading || otpCode.length !== 6}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  認証する
                </Button>
                <div className="flex justify-between text-xs">
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setStep("login"); setFormError(""); }}>
                    戻る
                  </button>
                  <button type="button" className="text-primary hover:underline" onClick={handleResendOtp}>
                    コードを再送信
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
