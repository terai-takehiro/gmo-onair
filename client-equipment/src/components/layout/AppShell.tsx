import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppShell() {
  // 根は h-screen (100vh) ではなく h-full。iOS の 100vh は URL バーを含むので
  // 実際の表示領域より高くなり、#root の overflow: hidden で下端が切れる。
  // 親の高さは shared/src/client/base.css が html/body/#root に配っている。
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 min-h-0 overflow-y-auto" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
