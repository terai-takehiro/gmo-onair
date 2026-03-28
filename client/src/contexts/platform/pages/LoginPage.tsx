import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "../AuthContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, User } from "lucide-react";

const roleLabelMap: Record<string, string> = {
  system_admin: "システム管理者",
  staff: "スタッフ",
  viewer: "閲覧者",
  external_client: "外部クライアント",
};

const roleColorMap: Record<string, string> = {
  system_admin: "#dc2626",
  staff: "#005bac",
  viewer: "#059669",
  external_client: "#7c3aed",
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
    navigate("/", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100">
      <div className="w-full max-w-2xl px-4">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary sm:text-4xl">GMO ONAiR</h1>
          <p className="mt-2 text-base text-muted-foreground sm:text-lg">
            統合業務管理システム
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {users?.map((user) => (
              <Card
                key={user.id}
                className="cursor-pointer transition-all hover:shadow-lg hover:ring-2 hover:ring-primary/50"
                onClick={() => handleLogin(user.id)}
              >
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{user.name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <Badge
                      className="mt-1"
                      color={roleColorMap[user.role]}
                    >
                      {roleLabelMap[user.role] || user.role}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          ユーザーカードをクリックしてログインしてください
        </p>
      </div>
    </div>
  );
}
