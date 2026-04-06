import { useNavigate } from "react-router-dom";
import { useAuth, BLOCK_APPS, type BlockApp } from "@/contexts/platform/AuthContext";
import { PageTransition, StaggerList, StaggerItem } from "@/components/ui/motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  FolderKanban,
  PiggyBank,
  Calendar,
  Package,
  FileText,
  BookOpen,
  Users,
  Truck,
  Sparkles,
  UserCog,
  Database,
  Settings,
  ExternalLink,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  FolderKanban,
  PiggyBank,
  Calendar,
  Package,
  FileText,
  BookOpen,
  Users,
  Truck,
  Sparkles,
};

function AppCard({ app, onClick }: { app: BlockApp; onClick: () => void }) {
  const Icon = ICON_MAP[app.icon] || Package;
  const isComingSoon = app.status === "coming_soon";
  const isExternal = !!app.externalUrl;

  return (
    <button
      onClick={isComingSoon ? undefined : onClick}
      disabled={isComingSoon}
      className={cn(
        "group relative flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center transition-all",
        isComingSoon
          ? "cursor-default border-dashed border-muted bg-muted/30 opacity-60"
          : "border-transparent bg-card shadow-none hover:shadow-[0_0_0_1px_#d5d3cb] hover:-translate-y-1 hover:border-primary/20 active:scale-[0.98]"
      )}
    >
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-xl text-white transition-transform",
          isComingSoon ? "bg-muted-foreground/30" : app.color,
          !isComingSoon && "group-hover:scale-110"
        )}
      >
        <Icon className="h-7 w-7" />
      </div>
      <div>
        <h3 className="text-base font-serif font-medium">{app.label}</h3>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {app.description}
        </p>
      </div>
      {isComingSoon && (
        <Badge variant="secondary" className="absolute top-3 right-3 text-[10px]">
          準備中
        </Badge>
      )}
      {isExternal && !isComingSoon && (
        <ExternalLink className="absolute top-3 right-3 h-3.5 w-3.5 text-muted-foreground/50" />
      )}
    </button>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";

  const visibleApps = BLOCK_APPS.filter(
    (app) => app.status === "coming_soon" || hasPermission(app.id)
  );

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl px-4 py-8 lg:py-12">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="heading-page text-3xl tracking-tight lg:text-4xl">
            GMO ON<span className="text-primary">Ai</span>R
          </h1>
          <p className="mt-2 text-muted-foreground">
            {currentUser?.name} さん、おかえりなさい
          </p>
        </div>

        {/* App Grid */}
        <StaggerList className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6">
          {visibleApps.map((app) => (
            <StaggerItem key={app.id}>
              <AppCard
                app={app}
                onClick={() => {
                  if (app.externalUrl) {
                    window.open(app.externalUrl, "_blank", "noopener,noreferrer");
                  } else if (['qsheet', 'equipment', 'interactive'].includes(app.id)) {
                    // Sub-apps are separate SPAs — full page navigation
                    window.location.href = app.basePath;
                  } else {
                    navigate(app.basePath);
                  }
                }}
              />
            </StaggerItem>
          ))}
        </StaggerList>

        {/* Admin Section */}
        {isAdmin && (
          <div className="mt-12 border-t pt-8">
            <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              システム管理
            </h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate("/admin/users")}
                className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
              >
                <UserCog className="h-4 w-4 text-muted-foreground" />
                ユーザー管理
              </button>
              <button
                onClick={() => navigate("/admin/data-viewer")}
                className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
              >
                <Database className="h-4 w-4 text-muted-foreground" />
                データビューア
              </button>
              <button
                onClick={() => navigate("/admin/settings")}
                className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
                システム設定
              </button>
            </div>
          </div>
        )}

        {/* Version */}
        <p className="mt-12 text-center text-xs text-muted-foreground/50">
          v0.6.0
        </p>
      </div>
    </PageTransition>
  );
}
