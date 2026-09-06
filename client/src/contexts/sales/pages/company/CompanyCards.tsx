/**
 * ⑧ 取引先マスター — スマホのカード
 *
 * ── 行を縮めたものではありません ────────────────────────────
 *
 * PC の行は6列（取引先名／役割／連絡先／インボイス番号／関連ページ／操作）で、
 * 375px では `hideOnMobile` が連絡先・インボイス番号・関連ページを**消す**だけ
 * でした（監査 2026-08-20・要対応）。つまりスマホでは「名前と役割」しか読めず、
 * 誰に連絡すればよいか・請求書に何を書けばよいかが分かりません。
 *
 * → 列を消すのではなく、**カードとして組み直します**:
 *
 *   1行目  取引先名（折り返してよい）＋ グループの印
 *   2行目  役割バッジ
 *   3行目  連絡先（担当者・メール／電話）。無ければ出さない
 *   4行目  インボイス登録番号（財務が読める人だけ）。無ければ出さない
 *   5行目  関連ページ（取引実績／仕入先ページ）。無ければ出さない
 *   6行目  操作（収支サマリー・編集・削除）。`canManage` が無ければ出さない
 *
 * ── タップの領域 ────────────────────────────────────────────
 *
 * カード自体は PC の行と同じ条件（`canEditThis`）でだけ押せるようにします。
 * 押せないときにカードへ `onClick` を付けると、押しても何も起きないのに
 * 押せそうに見える（`active:` の反応だけ出て編集画面が開かない）ので避けます。
 */
import { ExternalLink, BarChart3, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableBadge } from "@gmo-onair/shared/src/client/ui/tableBadge";
import { cn } from "@gmo-onair/shared/src/client/utils";
import { RoleBadges } from "./RoleBadges";
import type { Company } from "./types";

export function CompanyCards({
  items,
  canReadBudget,
  canManage,
  canDelete,
  canEditVendor,
  onEdit,
  onDelete,
  onSummary,
  onOpenCustomer,
  onOpenVendor,
}: {
  items: Company[];
  canReadBudget: boolean;
  canManage: boolean;
  canDelete: boolean;
  canEditVendor: boolean;
  onEdit: (c: Company) => void;
  onDelete: (c: Company) => void;
  onSummary: (c: Company) => void;
  onOpenCustomer: (c: Company) => void;
  onOpenVendor: (c: Company) => void;
}) {
  return (
    <ul className="v4-card-in flex flex-col gap-2">
      {items.map((c) => {
        // **編集そのものを止める。** PC の行と同じ理由・同じ条件
        // （サーバーが `budget:editor` を持たない `sales:owner` の保存を拒む）
        const editBlockedByVendor = c.is_vendor && !canEditVendor;
        const canEditThis = canManage && !editBlockedByVendor;
        const contact = c.contact_name || c.short_name;
        const hasContact = !!(contact || c.email || c.phone);
        const showCustomerLink = !!c.customer_id;
        const showVendorLink = !!c.vendor_id && canReadBudget;

        return (
          <li key={c.id}>
            <div
              className={cn(
                "rounded-card flex flex-col gap-2 border border-border bg-card p-3.5",
                canEditThis && "active:bg-surface-subtle",
              )}
              role={canEditThis ? "button" : undefined}
              tabIndex={canEditThis ? 0 : undefined}
              onClick={canEditThis ? () => onEdit(c) : undefined}
              onKeyDown={
                canEditThis
                  ? (e) => {
                      if (e.key === "Enter") onEdit(c);
                    }
                  : undefined
              }
            >
              <div className="flex items-start gap-1.5">
                {/* **省略記号で切らず、2行まで折り返す。**（PC 行と同じ理由。
                    `truncate` だと長い正式名称が変な略称のように読める） */}
                <span className="text-list min-w-0 flex-1 line-clamp-2 text-foreground">{c.name}</span>
                {c.is_gmo_group && <TableBadge label="グループ" w={null} variant="info" />}
              </div>

              <RoleBadges c={c} />

              {hasContact && (
                <div className="text-sub flex flex-col gap-0.5 text-muted-foreground">
                  {contact && <span className="truncate">{contact}</span>}
                  {(c.email || c.phone) && <span className="truncate">{c.email || c.phone}</span>}
                </div>
              )}

              {canReadBudget && c.invoice_registration_number && (
                <div className="text-sub-sm truncate text-muted-foreground">
                  インボイス登録番号：{c.invoice_registration_number}
                </div>
              )}

              {(showCustomerLink || showVendorLink) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border-faint pt-2">
                  {showCustomerLink && (
                    <button
                      type="button"
                      className="min-h-tap flex items-center gap-1 text-sub-sm text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCustomer(c);
                      }}
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      取引実績
                    </button>
                  )}
                  {showVendorLink && (
                    <button
                      type="button"
                      className="min-h-tap flex items-center gap-1 text-sub-sm text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenVendor(c);
                      }}
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      仕入先ページ
                    </button>
                  )}
                </div>
              )}

              {canManage && (
                <div className="flex gap-2 border-t border-border-faint pt-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSummary(c);
                    }}
                  >
                    <BarChart3 className="mr-1.5 h-4 w-4 text-primary" aria-hidden="true" />
                    収支
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={editBlockedByVendor}
                    title={
                      editBlockedByVendor
                        ? "仕入先を兼ねているため、財務管理の編集権限が無いと編集できません"
                        : undefined
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canEditThis) onEdit(c);
                    }}
                  >
                    <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    編集
                  </Button>
                  {canDelete && (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="削除"
                      className="shrink-0 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
