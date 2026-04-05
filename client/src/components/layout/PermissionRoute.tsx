import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/platform/AuthContext";

interface Props {
  module: string;
  minLevel?: "viewer" | "editor" | "member" | "admin";
  children: React.ReactNode;
}

export default function PermissionRoute({ module, minLevel = "viewer", children }: Props) {
  const { hasPermission, isAuthenticated } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasPermission(module, minLevel)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <h2 className="text-xl font-semibold">アクセス権限がありません</h2>
        <p className="text-muted-foreground">このページへのアクセスは許可されていません</p>
      </div>
    );
  }

  return <>{children}</>;
}
