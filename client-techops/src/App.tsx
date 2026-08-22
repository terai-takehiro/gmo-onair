import { Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import { TECHOPS_ROOT_PATH } from "@/routeSwitch";
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
  if (!isAuthenticated) return <RedirectOnce to="/techops/login" />;
  return <>{children}</>;
}

/**
 * 旧 `/qsheet/*` からの転送（qsheet→techops移行 Phase 2・2026-08-22）。
 *
 * `:id` / `:ownerKey` / `:company` を持つルートで `<Navigate to="/techops/editor/:id">`
 * のように**文字列の `:id` をそのまま書くと置換されない**（React Router の
 * `<Navigate>` はパスをリテラルとしてしか見ない）。旧→新のどの組でも**接頭辞
 * `/qsheet` → `/techops` の入れ替えだけで残りは完全に同じ形**なので、個別に
 * パラメータを拾って組み立てるのではなく、**実際に解決済みのパス文字列**
 * （`useLocation().pathname`）の接頭辞だけを機械的に入れ替える。
 * クエリ文字列も維持する（`/qsheet/audio/:id?token=…` の共有トークン等）。
 */
function RedirectQsheetToTechops() {
  const { pathname, search } = useLocation();
  const to = pathname.replace(/^\/qsheet(?=\/|$)/, '/techops');
  return <Navigate to={`${to}${search}`} replace />;
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <Routes>
      <Route
        path="/techops/login"
        element={isAuthenticated ? <RedirectOnce to={TECHOPS_ROOT_PATH} /> : <LoginPage />}
      />

      {/* Pages with AppShell (Header + Sidebar) */}
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        {/*
          `/techops` は画面を持たず、`routeSwitch.ts` の1行だけを見て転送する
          （03-app-structure-impl.md §3-3）。`/techops/top`（アプリ全体のトップ・
          ミニアプリのタイル）・`/techops/home`（進行台本の案件選択）・
          `/techops/sheets`（進行台本の一覧）は常に3つとも存在する。
        */}
        <Route path="/techops" element={<RedirectOnce to={TECHOPS_ROOT_PATH} />} />
        <Route path="/techops/top" element={<ProductionTopPage />} />
        <Route path="/techops/home" element={<TopPage />} />
        <Route path="/techops/sheets" element={<SheetListPage />} />
        {/* 旧 URL。転送は1段（`/techops` を経由しない） */}
        <Route path="/techops/editor" element={<RedirectOnce to="/techops/sheets" />} />
        <Route path="/techops/editor/:id" element={<EditorPage />} />
        {/* 収録設定・配信設定（機器設定）。案件単位（:ownerKey）で文書とは別の入れ物。
            簡易入口（旧 `/qsheet/device-settings`・`DeviceSettingsHome.tsx`）は
            2026-08-22 に廃止した（サイドバー・スマホタブが案件/番組の文脈から
            直接この2画面へリンクするようになったため。CLAUDE.md の「廃止」の定義通り、
            ファイルは残しコードからの導線だけ外した） */}
        <Route path="/techops/recording/:ownerKey" element={<RecordingPage />} />
        <Route path="/techops/streaming/:ownerKey" element={<StreamingPage />} />
        {/* レンタル機材検索。案件単位（:ownerKey）で文書とは別の入れ物（2026-08-22 追加） */}
        <Route path="/techops/rental/:ownerKey" element={<RentalSearchPage />} />
        <Route path="/techops/rental/:ownerKey/list" element={<RentalReservationsPage />} />
        <Route path="/techops/rental/:ownerKey/mail/:company" element={<RentalMailPage />} />
        {/* 計時・視聴者（liveops）。案件単位（:ownerKey）。
            組織の鍵設定（live-org-settings）だけ ownerKey を取らない（system_admin/qsheet
            manager 向け・案件に紐づかない設定のため） */}
        <Route path="/techops/live/:ownerKey" element={<LiveDashboardPage />} />
        <Route path="/techops/live/:ownerKey/timers" element={<LiveTimerAdminPage />} />
        <Route path="/techops/live/:ownerKey/settings" element={<LiveProgramSettingsPage />} />
        <Route path="/techops/live-org-settings" element={<LiveOrgSettingsPage />} />
        {/* 案件に紐づかない既存セッション（旧スタンドアロン作成）の一覧。新規作成ボタンは無い
            — セッション一覧の廃止に伴う UI 到達性の回復のみが目的（レビュー対応・§致命的2） */}
        <Route path="/techops/live-legacy" element={<LiveLegacyProgramsPage />} />

        {/* スケジュール表（段4・04-schedule-impl.md §5-1） */}
        <Route path="/techops/schedules" element={<ScheduleListPage />} />
        <Route path="/techops/schedules/:id" element={<SchedulePage />} />
        <Route path="/techops/settings/schedule-templates" element={<ScheduleTemplateSettingsPage />} />

        {/* 制作のジャーニー（段3・03-app-structure-impl.md §3-2・§8 PR F）。案件の入口／資料単体の入口 */}
        <Route path="/techops/projects/:id" element={<JourneyPage scope="project" />} />
        <Route path="/techops/docs/:id" element={<JourneyPage scope="document" />} />
        {/* 番組（マニュアル・案件管理外）の入口。2026-08-22 追加 */}
        <Route path="/techops/programs/:id" element={<JourneyPage scope="program" />} />
      </Route>

      {/* Full-screen pages without AppShell */}
      <Route path="/techops/onair/:id" element={<ProtectedRoute><OnAirPage /></ProtectedRoute>} />
      <Route path="/techops/rundown/:id" element={<ProtectedRoute><RundownPage /></ProtectedRoute>} />
      <Route path="/techops/prompter/:id" element={<ProtectedRoute><PrompterPage /></ProtectedRoute>} />

      {/* Public audio support dashboard — no auth required, docId-based */}
      <Route path="/techops/audio/:id" element={<AudioSupportPage />} />

      {/*
        ここから旧 `/qsheet/*` の互換転送（qsheet→techops移行 Phase 2・2026-08-22）。
        ベースパスを `/qsheet/` → `/techops/` に改名したための後方互換で、
        ブックマーク・配布済みQR・OBSブラウザソースURLを壊さないよう旧パスを全部残す。
        `<Redirect…>` という名前なので `check-mobile-declared.mjs` は「転送」として
        扱い、画面としては数えない。
        ⚠️ Socket.IO ネームスペースは `/qsheet` のまま変えていない（Phase 3 で扱う。
        `lib/socket.ts` 参照）ので、この転送は URL の見た目だけの話であり
        リアルタイム同期には影響しない。

        旧→新は下記のとおり全て接頭辞の入れ替えだけ（`RedirectQsheetToTechops` が
        機械的に処理）: login / (top) / top / home / sheets / editor(/:id) /
        recording/:ownerKey / streaming/:ownerKey / rental/:ownerKey(/list)
        (/mail/:company) / live/:ownerKey(/timers)(/settings) / live-org-settings /
        live-legacy / schedules(/:id) / settings/schedule-templates / projects/:id /
        docs/:id / programs/:id / onair/:id / rundown/:id / prompter/:id / audio/:id。
        `/qsheet/editor`（id無し）だけは `/techops/editor` 経由で
        `/techops/sheets` へさらに1段転送される（既存の同名ルートと同じ挙動）。
      */}
      {/* 裸の `/qsheet` だけは最終地（`TECHOPS_ROOT_PATH`）へ直接1段で転送する
          （旧実装の「転送は1段」原則を踏襲。`/qsheet/*` 経由だと `/techops` を
          挟んで2段になる） */}
      <Route path="/qsheet" element={<RedirectOnce to={TECHOPS_ROOT_PATH} />} />
      <Route path="/qsheet/*" element={<RedirectQsheetToTechops />} />

      {/* 転送は1段。`/techops` を経由すると RedirectOnce の 200ms フォールバックに触れる */}
      <Route path="*" element={<RedirectOnce to={TECHOPS_ROOT_PATH} />} />
    </Routes>
  );
}
