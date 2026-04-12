import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useAuth } from "@/hooks/useAuth";

export default function AppShell() {
  const { currentUser, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-x-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Header userName={currentUser?.name} onLogout={logout} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
          <footer className="py-3 px-4 text-center text-xs text-muted-foreground/40 border-t mt-8">
            © 2026 GMO Global Studio &middot; ONAiR v1.0.0
          </footer>
        </main>
      </div>
    </div>
  );
}
