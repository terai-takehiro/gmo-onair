import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AppShell as SharedAppShell } from "@gmo-onair/shared/src/client/shell";
import { NotificationBell } from "@gmo-onair/shared/src/client-v4/NotificationBell";
import { PcOnlyGate } from "@gmo-onair/shared/src/client-v4/pcOnly";
import api from "@/lib/api";
import { TECHOPS_PC_ONLY, TECHOPS_MOBILE_HIDDEN } from "@/pcOnlyScreens";
import { useAuth } from "@/hooks/useAuth";
import { QSHEET_MANUAL } from "@/manual/content";
import { useProductionNavContext } from "@/lib/productionNavContext";
import { buildQsheetNav } from "./nav";

/**
 * 制作資料のシェル — **枠は共通** (`shared/src/client/shell/`)。
 *
 * これまでの独自実装 `Header.tsx`（`AppHeader` のラッパー）・`Sidebar.tsx` は
 * このファイルが共通シェルを呼ぶ薄いラッパーに置き換わったので削除した。
 * 高さ・スクロール・お知らせ帯・確認ダイアログ・アプリ切替・スマホの引き出しは
 * すべて共通シェルが持つ。**メニューの項目は `nav.ts` の `buildQsheetNav`**（2026-08-22〜。
 * いまの URL と `lib/productionNavContext.ts` のストアから動的に組み立てる。詳細は `nav.ts` 冒頭）。
 *
 * ⚠️ **本番3画面（`/qsheet/onair` / `rundown` / `prompter`）と公開音声サポート
 * （`/qsheet/audio`）はこのシェルの対象外**（`App.tsx` で「Full-screen pages
 * without AppShell」と明記された別ルート）。ここを触ってもそれらの見た目・
 * 挙動は変わらない。
 *
 * **閲覧のゲートは足していない。** 旧 `Header.tsx` / `Sidebar.tsx` にも権限による
 * 表示ゲートは無く（`equipment/AppShell.tsx` と同じ事情）、ここで新設すると
 * 権限を持たない既存の利用者が突然入れなくなる。入れるなら別作業で。
 *
 * **トーストは残す。** `main.tsx` のトースト表示部品はこのシェルとは別に置いたまま
 * （13 か所・放送中の切断通知を含む。`shared/CLAUDE.md`「トーストは残っているが、
 * v4 では使わない」と `docs/design/v4/qsheet-v4-coding/impl/09-live-timer-impl.md`
 * の決めごと通り）。共通シェルが持つお知らせ帯へは置き換えない。
 *
 * ⚠️ `scripts/check-shared-wiring.mjs` はコメントの中の実物タグも数えるので、
 * ここでは部品名をタグの形（山括弧つき）で書かないこと（`shared/CLAUDE.md` の
 * 「コメントに書いたクラス名も Tailwind に拾われます」と同じ理由の別バージョン）。
 */
export default function AppShell() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const productionNavContext = useProductionNavContext();
  const { sections, mobileTabs } = buildQsheetNav(location.pathname, searchParams, productionNavContext);

  return (
    <SharedAppShell
      appKey="qsheet"
      mobileHiddenPaths={TECHOPS_MOBILE_HIDDEN}
      sections={sections}
      mobileTabs={mobileTabs}
      notificationSlot={<NotificationBell api={api} />}
      manualContent={QSHEET_MANUAL}
      user={currentUser ? { name: currentUser.name, role: currentUser.role, email: currentUser.email } : null}
      onLogout={logout}
      onSwitchUser={logout}
      role={currentUser?.role}
      permissions={currentUser?.permissions as Record<string, string> | undefined}
    >
      {/* **PC で触る画面はスマホで縮めない**（M2）。宣言は `@/pcOnlyScreens` の1つの表 */}
      <PcOnlyGate table={TECHOPS_PC_ONLY} onGoInstead={(to) => navigate(to)}>
        <Outlet />
      </PcOnlyGate>
    </SharedAppShell>
  );
}
