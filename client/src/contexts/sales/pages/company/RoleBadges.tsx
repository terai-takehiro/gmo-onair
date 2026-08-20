/**
 * 取引先マスターの役割バッジ（一覧の PC 行・スマホカードで共用）
 *
 * `CompanyListPage.tsx` から切り出したもの。**写しを作らないこと** —
 * PC とスマホでバッジの出し方が食い違う原因になる。
 */
import { TableBadge } from "@gmo-onair/shared/src/client/ui/tableBadge";
import type { Company } from "./types";

/** この会社が持つ役割のバッジ（グループの印は別枠なのでここには含めない） */
export function RoleBadges({ c }: { c: Company }) {
  if (!c.is_customer && !c.is_vendor && !c.is_sga_payee) {
    return <TableBadge label="その他" w={null} variant="outline" />;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {c.is_customer && <TableBadge label="顧客" w={null} variant="secondary" />}
      {c.is_vendor && <TableBadge label={c.vendor_type || "仕入先"} w={null} variant="info" />}
      {c.is_sga_payee && <TableBadge label="販管費支払先" w={null} variant="warning" />}
    </span>
  );
}
