import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, AlertCircle, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

/** SPA navigate ではなくハード遷移 (replaceState を経由しない) */
const hardReplace = (path: string) => window.location.replace(path);

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

const roleLabelMap: Record<string, string> = {
  system_admin: "システム管理者",
  staff: "スタッフ",
};

export default function LoginPage() {
  const { currentUser: user, loading, login, loginWithToken } = useAuth();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');
  const token = searchParams.get('token');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [authMode, setAuthMode] = useState<'oauth' | 'mock' | null>(null);

  // 既ログインなら一度だけ /interactive トップに飛ばす (hard navigation で replaceState 回避)
  // v2.4.2: /auth/me で auth 確定 (loading=false) を待つ。stale localStorage 即リダイレクト防止。
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (redirectedRef.current) return;
    if (loading) return;
    if (user && !token) {
      redirectedRef.current = true;
      hardReplace('/interactive/');
    }
  }, [user, token, loading]);

  // SSO トークンのコンスーム — 一度だけ
  const tokenConsumedRef = useRef(false);
  useEffect(() => {
    if (!token || tokenConsumedRef.current) return;
    tokenConsumedRef.current = true;
    loginWithToken(token)
      .then(() => hardReplace('/interactive/'))
      .catch(() => hardReplace('/interactive/login?error=auth_failed'));
  }, [token, loginWithToken]);

  // 認証モード判定 — 一度だけ
  const modeFetchedRef = useRef(false);
  useEffect(() => {
    if (modeFetchedRef.current || token || user) return;
    modeFetchedRef.current = true;
    api.get('/auth/mode')
      .then((r) => {
        const mode = r.data.data.mode;
        setAuthMode(mode);
        if (mode === 'mock') {
          api.get('/auth/users')
            .then((r2) => setUsers(r2.data.data || []))
            .catch(() => {});
        }
      })
      .catch(() => setAuthMode('mock'));
  }, [token, user]);

  // v2.4.2: login() を必ず await して cookie / localStorage 確定後に遷移。
  // fire-and-forget は in-flight の /auth/mock-login が abort され cookie が立たず
  // ループの遠因になっていた。
  const handleLogin = async (u: UserOption) => {
    try {
      await login(u.id);
      hardReplace('/interactive/');
    } catch {
      hardReplace('/interactive/login?error=login_failed');
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = '/api/v1/internal/auth/google';
  };

  return (
    <div className="login-bg relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />

      <div className="glass-card animate-slide-up relative z-10 w-full max-w-md px-8 py-10">
        <div className="mb-8 text-center">
          <img
            src="/interactive/logo-onair.svg"
            alt="GMO ONAiR"
            className="mx-auto mb-4 h-8 w-auto"
          />
          <div className="inline-flex items-center justify-center gap-3 mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-primary">EventStamp</h1>
          </div>
          <p className="text-base text-muted-foreground">
            インタラクティブ演出支援
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>認証に失敗しました。管理者にお問い合わせください。</span>
          </div>
        )}

        {authMode === 'oauth' ? (
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
        ) : (
          <div className="space-y-3">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => handleLogin(u)}
                className="w-full flex items-center gap-4 rounded-2xl border border-primary/10 bg-white/60 backdrop-blur-sm p-4 text-left shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5 hover:bg-white/80 hover:border-primary/20"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{u.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {roleLabelMap[u.role] || u.role}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {authMode === 'mock' && (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            開発モード — ユーザーカードをクリックしてログイン
          </p>
        )}
      </div>
    </div>
  );
}
