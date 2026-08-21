import { Routes, Route } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { RedirectOnce } from "@gmo-onair/shared/src/client/RedirectOnce";
import AppShell from "@/components/layout/AppShell";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import EditorPage from "@/pages/EditorPage";
import OnAirPage from "@/pages/OnAirPage";
import RundownPage from "@/pages/RundownPage";
import PrompterPage from "@/pages/PrompterPage";
import AudioSupportPage from "@/pages/AudioSupportPage";
import DeviceSettingsHome from "@/pages/device-settings/DeviceSettingsHome";
import RecordingPage from "@/pages/recording/RecordingPage";
import StreamingPage from "@/pages/streaming/StreamingPage";
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
        {/* 収録設定・配信設定（機器設定）。案件単位（:ownerKey）で文書とは別の入れ物 */}
        <Route path="/qsheet/device-settings" element={<DeviceSettingsHome />} />
        <Route path="/qsheet/recording/:ownerKey" element={<RecordingPage />} />
        <Route path="/qsheet/streaming/:ownerKey" element={<StreamingPage />} />
      </Route>

      {/* Full-screen pages without AppShell */}
      <Route path="/qsheet/onair/:id" element={<ProtectedRoute><OnAirPage /></ProtectedRoute>} />
      <Route path="/qsheet/rundown/:id" element={<ProtectedRoute><RundownPage /></ProtectedRoute>} />
      <Route path="/qsheet/prompter/:id" element={<ProtectedRoute><PrompterPage /></ProtectedRoute>} />

      {/* Public audio support dashboard — no auth required, docId-based */}
      <Route path="/qsheet/audio/:id" element={<AudioSupportPage />} />

      <Route path="*" element={<RedirectOnce to="/qsheet" />} />
    </Routes>
  );
}
