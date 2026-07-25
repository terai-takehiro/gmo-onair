import { useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3, Package, ClipboardList, Wrench, ClipboardCheck,
  QrCode, MapPin, Building2, Palette, Server, Layers, Settings,
  Cable, Plug,
} from "lucide-react";
import SharedAppShell from "@gmo-onair/shared/src/client/shell/AppShell";
import { createPaletteSearch } from "@gmo-onair/shared/src/client/commandPalette/search";
import { createNotificationFetcher } from "@gmo-onair/shared/src/client/notifications";
import api from "@/lib/api";
import SecondaryNavList, { type SecondaryNavItem } from "@gmo-onair/shared/src/client/shell/SecondaryNavList";
import type { RailLinkRenderer } from "@gmo-onair/shared/src/client/shell/Rail";
import { realPathname } from "@gmo-onair/shared/src/client/shell/realPath";
import { useAuth } from "@/hooks/useAuth";
import { EQUIPMENT_MANUAL } from "@/manual/content";

/**
 * 機材管理の二次ナビ。
 * 14項目を「日々 / モノ / 設定」に割り直すのは Phase 10 (§4.16)。
 * ここではまずグループ見出しを入れて、どこに何があるか読めるようにした。
 */
const NAV_ITEMS: SecondaryNavItem[] = [
  { label: "ダッシュボード", href: "/equipment", Icon: BarChart3, exact: true, groupTitle: "日々" },
  { label: "貸出管理", href: "/equipment/lendings", Icon: ClipboardList },
  { label: "棚卸し", href: "/equipment/inventory", Icon: ClipboardCheck },
  { label: "メンテナンス", href: "/equipment/maintenance", Icon: Wrench },
  { label: "QRスキャン", href: "/equipment/scan", Icon: QrCode },

  { label: "機材一覧", href: "/equipment/items", Icon: Package, groupTitle: "モノ" },
  { label: "貸出機材一覧", href: "/equipment/model-groups", Icon: Layers },
  { label: "ケーブル管理", href: "/equipment/cables", Icon: Cable },
  { label: "コネクタ管理", href: "/equipment/connectors", Icon: Plug },
  { label: "ラック実装", href: "/equipment/racks", Icon: Server },

  { label: "保管場所管理", href: "/equipment/locations", Icon: MapPin, groupTitle: "設定" },
  { label: "メーカー管理", href: "/equipment/manufacturers", Icon: Building2 },
  { label: "機材色", href: "/equipment/colors", Icon: Palette },
  { label: "貸出機材設定", href: "/equipment/rental-settings", Icon: Settings },
];

const renderLink: RailLinkRenderer = ({ href, children, className, onClick, title, ...rest }) => (
  <NavLink to={href} className={className} onClick={onClick} title={title} {...rest}>
    {children}
  </NavLink>
);

export default function AppShell() {
  const { pathname } = useLocation();
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
      breadcrumb={<span className="font-bold text-foreground">機材管理</span>}
      secondaryNav={
        <SecondaryNavList items={NAV_ITEMS} currentPath={pathname} renderLink={renderLink} />
      }
      secondaryNavLabel="機材管理"
      commandPalette={{ onRun: (path) => { window.location.href = path; }, search: searchHits }}
      notifications={{ fetchData: fetchNotifications, onRun: (path) => { window.location.href = path; }, onOpenPrefs: () => { window.location.href = "/settings/notifications"; } }}
      manualContent={EQUIPMENT_MANUAL}
    >
      <Outlet />
    </SharedAppShell>
  );
}
