import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppShell() {
  // シェルの根は `h-full`（`h-screen`=100vh ではない）。
  // 段5 PR8 で `index.css` が `base.css` 経由になり、html/body/#root に
  // `height: 100%` が入った（shared/CLAUDE.md「共通の土台 base.css」）。
  // iOS の 100vh は URL バーを含むぶん表示領域より高くなり、下端が切れる。
  return (
    <div className="flex h-full overflow-x-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto overflow-x-hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
