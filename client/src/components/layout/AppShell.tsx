import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
          <footer className="py-3 px-4 text-center text-xs text-muted-foreground/40 border-t mt-8">
            © 2026 GMO Global Studio &middot; ONAiR v1.0.0
          </footer>
        </main>
      </div>
    </div>
  );
}
