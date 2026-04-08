import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/platform/AuthContext";

interface Props {
  module: string;
  minLevel?: "reader" | "exporter" | "editor" | "manager" | "owner";
  children: React.ReactNode;
}

export default function PermissionRoute({ module, minLevel = "reader", children }: Props) {
  const { hasPermission, isAuthenticated, permissionsLoaded } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!permissionsLoaded) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
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
