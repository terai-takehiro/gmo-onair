import { useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowRightLeft, Package, ClipboardList, Wrench, ClipboardCheck,
  QrCode, MapPin, Building2, Palette, Settings,
} from "lucide-react";
import SharedAppShell from "@gmo-onair/shared/src/client/shell/AppShell";
import LocationCrumb from "@gmo-onair/shared/src/client/shell/LocationCrumb";
import BackToProject from "@gmo-onair/shared/src/client/shell/BackToProject";
import { createPaletteSearch } from "@gmo-onair/shared/src/client/commandPalette/search";
import { createNotificationFetcher } from "@gmo-onair/shared/src/client/notifications";
import api from "@/lib/api";
import SecondaryNavList, { type SecondaryNavItem } from "@gmo-onair/shared/src/client/shell/SecondaryNavList";
import type { RailLinkRenderer } from "@gmo-onair/shared/src/client/shell/Rail";
import { realPathname } from "@gmo-onair/shared/src/client/shell/realPath";
import { useAuth } from "@/hooks/useAuth";
import { EQUIPMENT_MANUAL } from "@/manual/content";

/**
 * 機材管理の二次ナビ (§4.16 / デザイン 17a)。
 *
 * 14項目を **日々 / モノ / 設定** に割り直した。
 * 毎日使うのは 貸出・棚卸し・スキャン だけで、残りは台帳とマスター — 頻度も担当者も違う。
 *   - 日々 (`/equipment`): ダッシュボードという独立メニューをやめてここに統合
 *   - モノ (`/equipment/items`): 機材・貸出機材・ケーブル・コネクタ・ラック図を1つの種別タブに
 *   - 設定: マスターは頻度が低いので下にまとめる (§4.17 で `/settings` へ寄せる)
 */
const NAV_ITEMS: SecondaryNavItem[] = [
  { label: "日々（貸出・棚卸し）", href: "/equipment", Icon: ArrowRightLeft, exact: true, groupTitle: "日々" },
  { label: "貸出管理", href: "/equipment/lendings", Icon: ClipboardList },
  { label: "棚卸し", href: "/equipment/inventory", Icon: ClipboardCheck },
  { label: "メンテナンス", href: "/equipment/maintenance", Icon: Wrench },
  { label: "QRスキャン", href: "/equipment/scan", Icon: QrCode },

  { label: "モノ（台帳）", href: "/equipment/items", Icon: Package, groupTitle: "モノ" },

  { label: "保管場所", href: "/equipment/locations", Icon: MapPin, groupTitle: "設定" },
  { label: "メーカー", href: "/equipment/manufacturers", Icon: Building2 },
  { label: "機材色", href: "/equipment/colors", Icon: Palette },
  { label: "貸出機材設定", href: "/equipment/rental-settings", Icon: Settings },
];

const renderLink: RailLinkRenderer = ({ href, children, className, onClick, title, ...rest }) => (
  <NavLink to={href} className={className} onClick={onClick} title={title} {...rest}>
    {children}
  </NavLink>
);

export default function AppShell() {
  const { pathname, search } = useLocation();
  const { currentUser, logout, permissions } = useAuth();

  const searchHits = useMemo(() => createPaletteSearch(api), []);
  const fetchNotifications = useMemo(() => createNotificationFetcher(api), []);

  return (
    <SharedAppShell
      currentUser={currentUser}
      onLogout={logout}
      role={currentUser?.role}
      permissions={permissions}
      currentPath={realPathname(pathname)}
      breadcrumb={
        <span className="flex min-w-0 items-center gap-1.5">
          <BackToProject search={search} />
          <LocationCrumb path={realPathname(pathname)} fallback="機材管理" />
        </span>
      }
      secondaryNav={
        <SecondaryNavList items={NAV_ITEMS} currentPath={pathname} renderLink={renderLink} />
      }
      secondaryNavLabel="機材管理"
      commandPalette={{ onRun: (path) => { window.location.href = path; }, search: searchHits }}
      notifications={{ fetchData: fetchNotifications, onRun: (path) => { window.location.href = path; }, onOpenPrefs: () => { window.location.href = "/settings/notifications"; } }}
      manualContent={EQUIPMENT_MANUAL}
      onOpenSiteMap={() => { window.location.href = "/map"; }}
    >
      <Outlet />
    </SharedAppShell>
  );
}
