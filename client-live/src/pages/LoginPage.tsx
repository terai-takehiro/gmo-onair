import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Timer, AlertCircle, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

interface UserOption { id: string; name: string; email: string; role: string }

const roleLabel: Record<string, string> = { system_admin: 'システム管理者', staff: 'スタッフ' };

export default function LoginPage() {
  const { currentUser: user, login, loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');
  const token = searchParams.get('token');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [authMode, setAuthMode] = useState<'oauth' | 'mock' | 'password' | null>(null);

  useEffect(() => {
    if (user && !token) { navigate('/', { replace: true }); return; }
    if (token) {
      loginWithToken(token)
        .then(() => navigate('/', { replace: true }))
        .catch(() => navigate('/login?error=auth_failed', { replace: true }));
      return;
    }
    api.get('/auth/mode')
      .then(r => {
        const mode = r.data.data.mode;
        setAuthMode(mode);
        if (mode === 'mock') api.get('/auth/users').then(r2 => setUsers(r2.data.data || [])).catch(() => {});
      })
      .catch(() => setAuthMode('mock'));
  }, [user, navigate, token, loginWithToken]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500 text-white">
            <Timer className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">計時LIVE</h1>
          <p className="text-sm text-muted-foreground mt-1">タイマー・視聴者カウンター</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            認証に失敗しました
          </div>
        )}

        {authMode === 'oauth' && (
          <Button className="w-full" onClick={() => { window.location.href = '/api/v1/internal/auth/google'; }}>
            Google でログイン
          </Button>
        )}

        {authMode === 'password' && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              計時LIVEはメインアプリの認証情報を共有しています。<br />
              メインアプリにログインしてから、このページに戻ってください。
            </p>
            <Button className="w-full" onClick={() => {
              window.location.href = '/login?redirect=' + encodeURIComponent('/live');
            }}>
              ログインページへ
            </Button>
          </div>
        )}

        {authMode === 'mock' && users.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">ユーザーを選択</p>
            {users.map(u => (
              <button
                key={u.id}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-accent transition-colors"
                onClick={() => { login(u.id); navigate('/', { replace: true }); }}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel[u.role] || u.role}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {!authMode && (
          <div className="flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}
