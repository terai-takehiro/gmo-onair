import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function LoginPage() {
  const { user, login, loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');
  const token = searchParams.get('token');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [authMode, setAuthMode] = useState<'oauth' | 'mock' | null>(null);

  useEffect(() => {
    if (user && !token) { navigate('/', { replace: true }); return; }

    // Handle OAuth callback token
    if (token) {
      loginWithToken(token)
        .then(() => navigate('/', { replace: true }))
        .catch(() => navigate('/login?error=auth_failed', { replace: true }));
      return;
    }

    // Detect auth mode
    api.get('/auth/mode')
      .then((r) => {
        const mode = r.data.data.mode;
        setAuthMode(mode);
        if (mode === 'mock') {
          api.get('/users').then((r2) => setUsers(r2.data.data || [])).catch(() => {});
        }
      })
      .catch(() => setAuthMode('mock'));
  }, [user, navigate, token, loginWithToken]);

  const handleLogin = (u: UserOption) => {
    login(u);
    navigate('/', { replace: true });
  };

  const handleGoogleLogin = () => {
    window.location.href = '/api/v1/internal/auth/google';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-fuchsia-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-pink-600 mb-2">
            <Sparkles className="h-8 w-8" />
            <h1 className="text-2xl font-bold">EventStamp</h1>
          </div>
          <p className="text-gray-500 text-sm">インタラクティブ演出支援</p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>認証に失敗しました。管理者にお問い合わせください。</span>
          </div>
        )}

        {authMode === 'oauth' ? (
          <div className="flex flex-col items-center gap-6">
            <Button
              size="lg"
              className="flex items-center gap-3 px-8 py-6 text-base"
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
          <div className="space-y-2">
            {users.map((u) => (
              <Card key={u.id} className="cursor-pointer hover:border-pink-300 hover:shadow-md transition-all" onClick={() => handleLogin(u)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 font-bold">
                    {u.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
