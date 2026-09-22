import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
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
// 運営マニュアル（段A・docs/design/v4/production-manual.md）
import ManualListPage from "@/pages/opsmanual/ManualListPage";
// 段E: "/techops/manuals/:id" は PC・スマホで別画面に入れ替わる（薄い親。ManualDetailRouter.tsx）
import ManualDetailRouter from "@/pages/opsmanual/ManualDetailRouter";
import ManualPreviewPage from "@/pages/opsmanual/ManualPreviewPage";
// 会場図面（新ミニアプリ・docs/design/v4/venue-layout.md）。②編集は PC・スマホで
// 別画面に入れ替わる薄い親（ManualDetailRouter.tsx と同じ形。§14-5「スマホは閲覧のみ」）
import VenueListPage from "@/pages/venue/VenueListPage";
import VenueEditorRouter from "@/pages/venue/VenueEditorRouter";
import VenuePreviewPage from "@/pages/venue/VenuePreviewPage";
// 技術資料（新ミニアプリ・docs/design/v4/tech-docs.md）。①一覧は両端末、
// ②映像パッチ・③技術スタッフは同じ資料のタブ切替（PC＝編集・スマホ＝閲覧）、
// ⑤パッチ盤・⑥技術人員は manager 向けの台帳（PC専用）
import TechDocListPage from "@/pages/tech/TechDocListPage";
import TechDocPage from "@/pages/tech/TechDocPage";
import TechDocPrintPage from "@/pages/tech/TechDocPrintPage";
import TechPanelsPage from "@/pages/tech/TechPanelsPage";
import TechPersonsPage from "@/pages/tech/TechPersonsPage";
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
// 表示レイアウト編集・テンプレートライブラリ（v4.1・PR3・
// docs/design/v4/qsheet-v4-coding/13-live-display-layout-editor.md §6）
import LiveDisplayLayoutEditorPage from "@/pages/live/LiveDisplayLayoutEditorPage";
import LiveDisplayTemplateLibraryPage from "@/pages/live/LiveDisplayTemplateLibraryPage";
// AIナレッジの承認（core-redesign-plan.md Phase 2 ④。qsheet_ai_knowledge の唯一のUI）
import AiKnowledgePage from "@/pages/ai-knowledge/AiKnowledgePage";
// テロップCG（旧リアルタイムCGの後継ミニアプリ）。
// 2026-09-06 のゼロベース再設計（docs/design/v4/graphics-redesign.md）段A で
// ①一覧＋右パネル・④設定（1画面・4タブ）へ作り直した。
import GraphicsHubPage from "@/pages/graphics/GraphicsHubPage";
import GraphicsConsolePage from "@/pages/graphics/GraphicsConsolePage";
import GraphicsOutputPage from "@/pages/graphics/GraphicsOutputPage";
import GraphicsSettingsPage from "@/pages/graphics/GraphicsSettingsPage";
import RequestFormPage from "@/pages/graphics/RequestFormPage";
// テンプレート管理（段6-2・部品→テンプレート→ページ→送出リストの第2層）。
// 主導線（①の「＋テロップ」）からは外したが、既存テンプレートからの作成・編集・削除は
// 引き続き使える（④設定「見た目」タブに「上級者向け」リンクを残す・graphics-redesign.md §6）
import TemplateManagerPage from "@/pages/graphics/TemplateManagerPage";
// 旧リアルタイムCG（client-awards）過去実績データの変換移行ツール（段6-9・system_admin限定）。
// ④設定「連携」タブからだけリンクする（:ownerKey を取らない全体管理画面のため単独ルートのまま）
import AwardsMigrationPage from "@/pages/graphics/AwardsMigrationPage";
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

/**
 * テロップCG ゼロベース再設計（段A・2026-09-06）の後方互換転送。
 * 部品ライブラリ（`/parts`）は独立画面をやめ、①一覧の「＋テロップ」から
 * 直接カード（種類）を選ぶ動線に統合した。旧URLを開いたら①一覧へ。
 */
function RedirectToGraphicsHub() {
  const { ownerKey } = useParams<{ ownerKey: string }>();
  return <Navigate to={`/techops/graphics/${encodeURIComponent(ownerKey ?? '')}`} replace />;
}

/**
 * 演出SE管理（`/sounds`）・外部インタラクティブ連携設定（`/interactive-link`）は
 * 独立画面をやめ、④設定の「連携」タブに統合した。旧URLを開いたら
 * 設定画面のそのタブへ（`?tab=link`）。
 */
function RedirectToGraphicsSettings() {
  const { ownerKey } = useParams<{ ownerKey: string }>();
  return <Navigate to={`/techops/graphics/${encodeURIComponent(ownerKey ?? '')}/settings?tab=link`} replace />;
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
        {/* テロップCG。案件・番組単位（:ownerKey）。①ハブ（一覧＋右パネル）・本番モード
            （送出コンソール）・④設定（1画面・4タブ）。出力画面だけはシェル無し・
            認証なしの独立ルート（下記）。
            2026-09-06 のゼロベース再設計（docs/design/v4/graphics-redesign.md）段A で
            部品ライブラリ・演出SE管理・外部連携設定という3つの独立画面を畳み、
            ①の「＋テロップ」・④設定「連携」タブへ統合した（旧URLは下の転送で維持） */}
        <Route path="/techops/graphics/:ownerKey" element={<GraphicsHubPage />} />
        <Route path="/techops/graphics/:ownerKey/live" element={<GraphicsConsolePage />} />
        <Route path="/techops/graphics/:ownerKey/settings" element={<GraphicsSettingsPage />} />
        {/* 旧・部品ライブラリの独立画面（段Aで廃止・①「＋テロップ」のカード選択に統合） */}
        <Route path="/techops/graphics/:ownerKey/parts" element={<RedirectToGraphicsHub />} />
        {/* テンプレート管理（部品ライブラリの「組み合わせてテンプレートを作る」から。
            段6-2・PC専用 — ページ作成フォームと同じ列の多い情報密度のため。①の主導線からは
            外したが、④設定「見た目」タブの「テンプレート管理（上級者向け）」リンクから
            引き続き使える） */}
        <Route path="/techops/graphics/:ownerKey/templates" element={<TemplateManagerPage />} />
        {/* 旧・演出SE管理／外部インタラクティブ連携設定の独立画面（段Aで廃止・
            ④設定「連携」タブに統合） */}
        <Route path="/techops/graphics/:ownerKey/sounds" element={<RedirectToGraphicsSettings />} />
        <Route path="/techops/graphics/:ownerKey/interactive-link" element={<RedirectToGraphicsSettings />} />
        {/* 発注（テロ原・段5）。スマホ最優先のフォーム＋自分の発注一覧。
            ハブ画面（PC専用）と違い、この画面だけは pcOnlyScreens.ts の対象外
            （graphics.md §3「発注はスマホ可」の分業設計） */}
        <Route path="/techops/graphics/:ownerKey/request" element={<RequestFormPage />} />
        {/* 旧リアルタイムCG（awards）過去実績の変換移行ツール（段6-9）。案件/番組に紐づかない
            全体管理画面のため :ownerKey を取らない（LiveOrgSettingsPage.tsx と同じ位置づけ）。
            system_admin限定 — 画面内でゲートする */}
        <Route path="/techops/graphics/awards-migration" element={<AwardsMigrationPage />} />
        {/* レンタル機材検索。案件単位（:ownerKey）で文書とは別の入れ物（2026-08-22 追加） */}
        <Route path="/techops/rental/:ownerKey" element={<RentalSearchPage />} />
        <Route path="/techops/rental/:ownerKey/list" element={<RentalReservationsPage />} />
        <Route path="/techops/rental/:ownerKey/mail/:company" element={<RentalMailPage />} />
        {/* 計時・視聴者（liveops）。案件単位（:ownerKey）。
            組織の鍵設定（live-org-settings）だけ ownerKey を取らない（system_admin/qsheet
            manager 向け・案件に紐づかない設定のため） */}
        <Route path="/techops/live/:ownerKey" element={<LiveDashboardPage />} />
        <Route path="/techops/live/:ownerKey/timers" element={<LiveTimerAdminPage />} />
        <Route path="/techops/live/:ownerKey/timers/:timerId/layout" element={<LiveDisplayLayoutEditorPage />} />
        <Route path="/techops/live/:ownerKey/settings" element={<LiveProgramSettingsPage />} />
        <Route path="/techops/live-org-settings" element={<LiveOrgSettingsPage />} />
        {/* 表示レイアウトのテンプレートライブラリ。全案件横断（:ownerKey を取らない） */}
        <Route path="/techops/live-display-templates" element={<LiveDisplayTemplateLibraryPage />} />
        {/* 案件に紐づかない既存セッション（旧スタンドアロン作成）の一覧。新規作成ボタンは無い
            — セッション一覧の廃止に伴う UI 到達性の回復のみが目的（レビュー対応・§致命的2） */}
        <Route path="/techops/live-legacy" element={<LiveLegacyProgramsPage />} />

        {/* AIナレッジの承認。案件に紐づかない全体設定なので :ownerKey を取らない
            （閲覧は qsheet reader・操作ボタンは manager のみ。サーバー側ゲートと同じ線） */}
        <Route path="/techops/ai-knowledge" element={<AiKnowledgePage />} />

        {/* スケジュール表（段4・04-schedule-impl.md §5-1） */}
        <Route path="/techops/schedules" element={<ScheduleListPage />} />
        <Route path="/techops/schedules/:id" element={<SchedulePage />} />
        <Route path="/techops/settings/schedule-templates" element={<ScheduleTemplateSettingsPage />} />

        {/* 運営マニュアル（段A・docs/design/v4/production-manual.md §9） */}
        <Route path="/techops/manuals" element={<ManualListPage />} />
        {/* マニュアル1件。PC＝編集・スマホ＝閲覧専用（段E・§6⑥。ManualDetailRouter.tsx が入れ替える） */}
        <Route path="/techops/manuals/:id" element={<ManualDetailRouter />} />
        {/* 仕上がりと PDF（段D・production-manual.md §6⑤）。引き続き PC 専用 */}
        <Route path="/techops/manuals/:id/preview" element={<ManualPreviewPage />} />

        {/* 会場図面（新ミニアプリ・docs/design/v4/venue-layout.md §1）。①一覧は両端末、
            ②編集はPC＝編集・スマホ＝閲覧（VenueEditorRouter.tsx が入れ替える）、③仕上がりはPC専用 */}
        <Route path="/techops/venue-layouts" element={<VenueListPage />} />
        <Route path="/techops/venue-layouts/:id" element={<VenueEditorRouter />} />
        <Route path="/techops/venue-layouts/:id/preview" element={<VenuePreviewPage />} />

        {/* 技術資料（新ミニアプリ・docs/design/v4/tech-docs.md §1-1）。②③は同じ資料の
            タブ切替なので同じ部品で受ける（`/staff` かどうかは画面側が pathname で見る）。
            ④書き出し（`/print`）は段D。⑤⑥は manager 向けの台帳で PC 専用 */}
        <Route path="/techops/tech-docs" element={<TechDocListPage />} />
        <Route path="/techops/tech-docs/:id" element={<TechDocPage />} />
        <Route path="/techops/tech-docs/:id/staff" element={<TechDocPage />} />
        {/* ④書き出し（PC専用・tech-docs.md §8）。A4 横1枚に映像パッチと技術スタッフを並べる */}
        <Route path="/techops/tech-docs/:id/print" element={<TechDocPrintPage />} />
        <Route path="/techops/tech-panels" element={<TechPanelsPage />} />
        <Route path="/techops/tech-persons" element={<TechPersonsPage />} />

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

      {/* テロップCGの出力画面 — 認証なしの公開URL（OBS のブラウザソースが未ログインで
          開く。公開音声サポートと同じ決めごと・`lib/api.ts` の `publicPaths` にも登録済み） */}
      <Route path="/techops/graphics/output/:projectId" element={<GraphicsOutputPage />} />

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
        (/mail/:company) / live/:ownerKey(/timers)(/timers/:timerId/layout)(/settings) /
        live-org-settings / live-display-templates / live-legacy / ai-knowledge /
        schedules(/:id) / settings/schedule-templates / projects/:id /
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
