import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/platform/AuthContext";
import { NoPermissionPanel } from '@gmo-onair/shared/src/client/states';

interface Props {
  /** 単一モジュール指定 (従来)。anyOf 指定時は省略可 */
  module?: string;
  /** いずれかのモジュール権限があれば通過 (統合カレンダー等の複合ページ用) */
  anyOf?: string[];
  minLevel?: "reader" | "exporter" | "editor" | "manager" | "owner";
  children: React.ReactNode;
}

export default function PermissionRoute({ module, anyOf, minLevel = "reader", children }: Props) {
  const { hasPermission, isAuthenticated, permissionsLoaded } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!permissionsLoaded) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const allowed = anyOf && anyOf.length > 0
    ? anyOf.some((m) => hasPermission(m, minLevel))
    : module
      ? hasPermission(module, minLevel)
      : false;
  if (!allowed) {
    // §2.4: **白紙にせず、何の権限が必要かを名前で書く**。
    // 以前は「アクセス権限がありません / このページへのアクセスは許可されていません」
    // だけだったので、**誰に何を頼めばよいかが分からなかった**
    // (直リンク・ブックマーク・共有URLを踏んだときにここへ来る)。
    const modules = anyOf && anyOf.length > 0 ? anyOf : module ? [module] : [];
    return (
      <div className="p-6">
        <NoPermissionPanel
          modules={modules}
          level={minLevel === "exporter" ? "reader" : minLevel === "owner" ? "manager" : minLevel}
        />
      </div>
    );
  }

  return <>{children}</>;
}
