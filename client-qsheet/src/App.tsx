import { Routes, Route } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { RedirectOnce } from "@gmo-onair/shared/src/client/RedirectOnce";
import AppShell from "@/components/layout/AppShell";
import LoginPage from "@/pages/LoginPage";
import SheetListPage from "@/pages/SheetListPage";
import EditorPage from "@/pages/EditorPage";
import OnAirPage from "@/pages/OnAirPage";
import RundownPage from "@/pages/RundownPage";
import PrompterPage from "@/pages/PrompterPage";
import AudioSupportPage from "@/pages/AudioSupportPage";
import TopPage from "@/pages/TopPage";
import JourneyPage from "@/pages/JourneyPage";
import ScheduleListPage from "@/pages/schedule/ScheduleListPage";
import SchedulePage from "@/pages/schedule/SchedulePage";
import ScheduleTemplateSettingsPage from "@/pages/schedule/ScheduleTemplateSettingsPage";
import { QSHEET_ROOT_PATH } from "@/routeSwitch";
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
        element={isAuthenticated ? <RedirectOnce to={QSHEET_ROOT_PATH} /> : <LoginPage />}
      />

      {/* Pages with AppShell (Header + Sidebar) */}
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        {/*
          `/qsheet` は画面を持たず、`routeSwitch.ts` の1行だけを見て転送する
          （03-app-structure-impl.md §3-3）。`/qsheet/home`（新トップ・案件を選ぶ）と
          `/qsheet/sheets`（旧トップ・進行台本の一覧）は常に両方存在する。
        */}
        <Route path="/qsheet" element={<RedirectOnce to={QSHEET_ROOT_PATH} />} />
        <Route path="/qsheet/home" element={<TopPage />} />
        <Route path="/qsheet/sheets" element={<SheetListPage />} />
        {/* 旧 URL。転送は1段（`/qsheet` を経由しない） */}
        <Route path="/qsheet/editor" element={<RedirectOnce to="/qsheet/sheets" />} />
        <Route path="/qsheet/editor/:id" element={<EditorPage />} />
        {/* 収録設定・配信設定（機器設定）。案件単位（:ownerKey）で文書とは別の入れ物 */}
        <Route path="/qsheet/device-settings" element={<DeviceSettingsHome />} />
        <Route path="/qsheet/recording/:ownerKey" element={<RecordingPage />} />
        <Route path="/qsheet/streaming/:ownerKey" element={<StreamingPage />} />

        {/* スケジュール表（段4・04-schedule-impl.md §5-1） */}
        <Route path="/qsheet/schedules" element={<ScheduleListPage />} />
        <Route path="/qsheet/schedules/:id" element={<SchedulePage />} />
        <Route path="/qsheet/settings/schedule-templates" element={<ScheduleTemplateSettingsPage />} />

        {/* 制作のジャーニー（段3・03-app-structure-impl.md §3-2・§8 PR F）。案件の入口／資料単体の入口 */}
        <Route path="/qsheet/projects/:id" element={<JourneyPage scope="project" />} />
        <Route path="/qsheet/docs/:id" element={<JourneyPage scope="document" />} />
      </Route>

      {/* Full-screen pages without AppShell */}
      <Route path="/qsheet/onair/:id" element={<ProtectedRoute><OnAirPage /></ProtectedRoute>} />
      <Route path="/qsheet/rundown/:id" element={<ProtectedRoute><RundownPage /></ProtectedRoute>} />
      <Route path="/qsheet/prompter/:id" element={<ProtectedRoute><PrompterPage /></ProtectedRoute>} />

      {/* Public audio support dashboard — no auth required, docId-based */}
      <Route path="/qsheet/audio/:id" element={<AudioSupportPage />} />

      {/* 転送は1段。`/qsheet` を経由すると RedirectOnce の 200ms フォールバックに触れる */}
      <Route path="*" element={<RedirectOnce to={QSHEET_ROOT_PATH} />} />
    </Routes>
  );
}
