import { Routes, Route } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { RedirectOnce } from "@gmo-onair/shared/src/client/RedirectOnce";
import AppShell from "@/components/layout/AppShell";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import EditorPage from "@/pages/EditorPage";
import OnAirPage from "@/pages/OnAirPage";
import LivePage from "@/pages/LivePage";
import RundownPage from "@/pages/RundownPage";
import PrompterPage from "@/pages/PrompterPage";
import AudioSupportPage from "@/pages/AudioSupportPage";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!isAuthenticated) return <RedirectOnce to="/qsheet/login" />;
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <Routes>
      <Route
        path="/qsheet/login"
        element={isAuthenticated ? <RedirectOnce to="/qsheet" /> : <LoginPage />}
      />

      {/* Pages with AppShell (Header + Sidebar) */}
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/qsheet" element={<DashboardPage />} />
        <Route path="/qsheet/editor" element={<DashboardPage />} />
        <Route path="/qsheet/editor/:id" element={<EditorPage />} />
      </Route>

      {/* Full-screen pages without AppShell */}
      {/* 本番は1入口 + 役割切替 (§4.13)。旧URLは残して ?role= に寄せる */}
      <Route path="/qsheet/live/:id" element={<ProtectedRoute><LivePage /></ProtectedRoute>} />
      <Route path="/qsheet/onair/:id" element={<ProtectedRoute><OnAirPage /></ProtectedRoute>} />
      <Route path="/qsheet/rundown/:id" element={<ProtectedRoute><RundownPage /></ProtectedRoute>} />
      <Route path="/qsheet/prompter/:id" element={<ProtectedRoute><PrompterPage /></ProtectedRoute>} />

      {/* Public audio support dashboard — no auth required, docId-based */}
      <Route path="/qsheet/audio/:id" element={<AudioSupportPage />} />

      <Route path="*" element={<RedirectOnce to="/qsheet" />} />
    </Routes>
  );
}
