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
import ProductionTopPage from "@/pages/ProductionTopPage";
import JourneyPage from "@/pages/JourneyPage";
import ScheduleListPage from "@/pages/schedule/ScheduleListPage";
import SchedulePage from "@/pages/schedule/SchedulePage";
import ScheduleTemplateSettingsPage from "@/pages/schedule/ScheduleTemplateSettingsPage";
import { QSHEET_ROOT_PATH } from "@/routeSwitch";
import DeviceSettingsHome from "@/pages/device-settings/DeviceSettingsHome";
import RecordingPage from "@/pages/recording/RecordingPage";
import StreamingPage from "@/pages/streaming/StreamingPage";
import RentalSearchPage from "@/pages/rental/RentalSearchPage";
import RentalReservationsPage from "@/pages/rental/RentalReservationsPage";
import RentalMailPage from "@/pages/rental/RentalMailPage";
// 計時・視聴者（liveops）の運用画面。案件単位（:ownerKey）で文書とは別の入れ物
// （v4.1 段2・ミニアプリ化フェーズ2・12-live-timer-decision.md §4）
import LiveDashboardPage from "@/pages/live/LiveDashboardPage";
import LiveTimerAdminPage from "@/pages/live/LiveTimerAdminPage";
import LiveProgramSettingsPage from "@/pages/live/LiveProgramSettingsPage";
import LiveOrgSettingsPage from "@/pages/live/LiveOrgSettingsPage";
import LiveLegacyProgramsPage from "@/pages/live/LiveLegacyProgramsPage";
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
          （03-app-structure-impl.md §3-3）。`/qsheet/top`（アプリ全体のトップ・
          ミニアプリのタイル）・`/qsheet/home`（進行台本の案件選択）・
          `/qsheet/sheets`（進行台本の一覧）は常に3つとも存在する。
        */}
        <Route path="/qsheet" element={<RedirectOnce to={QSHEET_ROOT_PATH} />} />
        <Route path="/qsheet/top" element={<ProductionTopPage />} />
        <Route path="/qsheet/home" element={<TopPage />} />
        <Route path="/qsheet/sheets" element={<SheetListPage />} />
        {/* 旧 URL。転送は1段（`/qsheet` を経由しない） */}
        <Route path="/qsheet/editor" element={<RedirectOnce to="/qsheet/sheets" />} />
        <Route path="/qsheet/editor/:id" element={<EditorPage />} />
        {/* 収録設定・配信設定（機器設定）。案件単位（:ownerKey）で文書とは別の入れ物 */}
        <Route path="/qsheet/device-settings" element={<DeviceSettingsHome />} />
        <Route path="/qsheet/recording/:ownerKey" element={<RecordingPage />} />
        <Route path="/qsheet/streaming/:ownerKey" element={<StreamingPage />} />
        {/* レンタル機材検索。案件単位（:ownerKey）で文書とは別の入れ物（2026-08-22 追加） */}
        <Route path="/qsheet/rental/:ownerKey" element={<RentalSearchPage />} />
        <Route path="/qsheet/rental/:ownerKey/list" element={<RentalReservationsPage />} />
        <Route path="/qsheet/rental/:ownerKey/mail/:company" element={<RentalMailPage />} />
        {/* 計時・視聴者（liveops）。案件単位（:ownerKey）。
            組織の鍵設定（live-org-settings）だけ ownerKey を取らない（system_admin/qsheet
            manager 向け・案件に紐づかない設定のため） */}
        <Route path="/qsheet/live/:ownerKey" element={<LiveDashboardPage />} />
        <Route path="/qsheet/live/:ownerKey/timers" element={<LiveTimerAdminPage />} />
        <Route path="/qsheet/live/:ownerKey/settings" element={<LiveProgramSettingsPage />} />
        <Route path="/qsheet/live-org-settings" element={<LiveOrgSettingsPage />} />
        {/* 案件に紐づかない既存セッション（旧スタンドアロン作成）の一覧。新規作成ボタンは無い
            — セッション一覧の廃止に伴う UI 到達性の回復のみが目的（レビュー対応・§致命的2） */}
        <Route path="/qsheet/live-legacy" element={<LiveLegacyProgramsPage />} />

        {/* スケジュール表（段4・04-schedule-impl.md §5-1） */}
        <Route path="/qsheet/schedules" element={<ScheduleListPage />} />
        <Route path="/qsheet/schedules/:id" element={<SchedulePage />} />
        <Route path="/qsheet/settings/schedule-templates" element={<ScheduleTemplateSettingsPage />} />

        {/* 制作のジャーニー（段3・03-app-structure-impl.md §3-2・§8 PR F）。案件の入口／資料単体の入口 */}
        <Route path="/qsheet/projects/:id" element={<JourneyPage scope="project" />} />
        <Route path="/qsheet/docs/:id" element={<JourneyPage scope="document" />} />
        {/* 番組（マニュアル・案件管理外）の入口。2026-08-22 追加 */}
        <Route path="/qsheet/programs/:id" element={<JourneyPage scope="program" />} />
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
