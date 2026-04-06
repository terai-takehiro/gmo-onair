import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import api from '@/lib/api';

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserOption[]>([]);

  useEffect(() => {
    if (user) { navigate('/', { replace: true }); return; }
    api.get('/users').then((r) => setUsers(r.data.data || [])).catch(() => {});
  }, [user, navigate]);

  const handleLogin = (u: UserOption) => {
    login(u);
    navigate('/', { replace: true });
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
      </div>
    </div>
  );
}
