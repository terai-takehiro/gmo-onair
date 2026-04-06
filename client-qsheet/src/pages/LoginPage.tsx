import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, User, FileText } from "lucide-react";

const roleLabelMap: Record<string, string> = {
  system_admin: "システム管理者",
  staff: "スタッフ",
  viewer: "閲覧者",
  external_client: "外部",
};

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const { data: users, isLoading } = useQuery({
    queryKey: ["auth-users"],
    queryFn: async () => {
      const res = await api.get("/auth/users");
      return res.data.data as Array<{ id: string; name: string; email: string; role: string }>;
    },
  });

  const handleLogin = async (userId: string) => {
    await login(userId);
    navigate("/qsheet", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-50 to-slate-100">
      <div className="w-full max-w-2xl px-4">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <FileText className="h-10 w-10 text-primary" />
            <h1 className="text-3xl font-bold text-primary sm:text-4xl">Qシート</h1>
          </div>
          <p className="text-base text-muted-foreground sm:text-lg">
            GMO ONAiR Cue Sheet Editor
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {users?.map((user) => (
              <button
                key={user.id}
                onClick={() => handleLogin(user.id)}
                className="flex items-center gap-4 rounded-lg border bg-white p-5 text-left shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {roleLabelMap[user.role] || user.role}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          ユーザーカードをクリックしてログイン
        </p>
      </div>
    </div>
  );
}
