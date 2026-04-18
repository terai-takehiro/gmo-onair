import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2, User, Wrench, AlertCircle } from "lucide-react";

const roleLabelMap: Record<string, string> = {
  system_admin: "システム管理者",
  staff: "スタッフ",
  viewer: "閲覧者",
  external_client: "外部",
};

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

  const { data: authMode } = useQuery({
    queryKey: ["auth-mode"],
    queryFn: async () => {
      const res = await api.get("/auth/mode");
      return res.data.data as { mode: "oauth" | "mock"; googleClientId: string | null };
    },
  });

  const { data: users, isLoading } = useQuery({
    queryKey: ["auth-users"],
    queryFn: async () => {
      const res = await api.get("/auth/users");
      return res.data.data as Array<{ id: string; name: string; email: string; role: string }>;
    },
    enabled: authMode?.mode === "mock",
  });

  const handleLogin = async (userId: string) => {
    await login(userId);
    navigate("/techsheet", { replace: true });
  };

  const handleGoogleLogin = () => {
    window.location.href = "/api/v1/internal/auth/google";
  };

  const isOAuth = authMode?.mode === "oauth";
  const isPassword = authMode?.mode === "password";

  return (
    <div className="login-bg relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />

      <div className="glass-card animate-slide-up relative z-10 w-full max-w-2xl px-8 py-10">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center gap-3 mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <Wrench className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-primary sm:text-4xl">技術資料</h1>
          </div>
          <p className="text-base text-muted-foreground">
            GMO ONAiR TechSheet
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>認証に失敗しました。管理者にお問い合わせください。</span>
          </div>
        )}

        {!authMode ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isPassword ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground text-center">
              GMO ONAiR メインアプリからログインしてください
            </p>
            <Button size="lg" className="px-8" onClick={() => { window.location.href = '/login?returnUrl=' + encodeURIComponent(window.location.href); }}>
              メインアプリでログイン
            </Button>
          </div>
        ) : isOAuth ? (
          <div className="flex flex-col items-center gap-6">
            <Button
              size="lg"
              className="flex items-center gap-3 px-8 py-6 text-base rounded-xl"
              onClick={handleGoogleLogin}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Googleアカウントでログイン
            </Button>
            <p className="text-xs text-muted-foreground">
              登録済みのGoogleアカウントでログインしてください
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {users?.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleLogin(user.id)}
                  className="flex items-center gap-4 rounded-2xl border border-primary/10 bg-white/60 backdrop-blur-sm p-5 text-left shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5 hover:bg-white/80 hover:border-primary/20"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 shrink-0">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{user.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      {roleLabelMap[user.role] || user.role}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-8 text-center text-xs text-muted-foreground">
              開発モード — ユーザーカードをクリックしてログイン
            </p>
          </>
        )}
      </div>
    </div>
  );
}
