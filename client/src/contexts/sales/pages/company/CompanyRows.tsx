/**
 * 取引先マスターの一覧表示 — **PC 版**
 *
 * `CompanyListPage.tsx` から切り出したもの（400行の基準に収めるため）。
 * スマホは `CompanyCards.tsx` が別に描くので、ここは**PC専用**として書ける
 * （`hideOnMobile`／`stackOnMobile`／`sm:` はもう要らない）。
 */
import { ExternalLink, Pencil, Trash2, BarChart3 } from "lucide-react";
import { Row, RowHeader, RowMain, RowSub, RowSlot } from "@gmo-onair/shared/src/client/ui/row";
import { TableBadge } from "@gmo-onair/shared/src/client/ui/tableBadge";
import { Button } from "@/components/ui/button";
import { RoleBadges } from "./RoleBadges";
import type { Company } from "./types";

export function CompanyRowsHeader({ canReadBudget, canManage }: { canReadBudget: boolean; canManage: boolean }) {
  return (
    <RowHeader>
      <RowMain>取引先名</RowMain>
      <RowSlot w={200}>役割</RowSlot>
      <RowSlot w={160}>連絡先</RowSlot>
      {/* **表頭は空でも `placeholder` の「—」を出さない。**
          `RowSlot` の既定は「値が無い」を「—」で示す仕組みで、見出しの列名にも
          同じ判定が働くと、権限が無くて列を隠しているだけなのに
          「データが無い」と見えてしまう（実ブラウザで確認して直した）。 */}
      <RowSlot w={160} placeholder="">{canReadBudget ? "インボイス番号" : ""}</RowSlot>
      <RowSlot w={160}>関連ページ</RowSlot>
      <RowSlot w={128} placeholder="">{canManage ? "操作" : ""}</RowSlot>
    </RowHeader>
  );
}

export function CompanyRow({
  c, canReadBudget, canManage, canDelete, canEditVendor, onEdit, onDelete, onSummary, onOpenCustomer, onOpenVendor,
}: {
  c: Company;
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
  // **編集そのものを止める。** サーバーは `budget:editor` を持たない
  // `sales:owner` に、仕入先を兼ねる会社の**どの項目の保存も** 403 で
  // 拒む（名前・電話番号だけの修正も）。出したまま押させて 403 に
  // 気づかせるより、押せない理由をここで先に言う
  const editBlockedByVendor = c.is_vendor && !canEditVendor;
  const canEditThis = canManage && !editBlockedByVendor;

  return (
    <Row
      divider
      // **名前を2行まで折り返すので `align="start"` にする**
      // （`row.tsx` の決めごと: 1行で省略する行と複数行になる行を
      // 中央寄せで混ぜるとバッジの高さがそろわない）
      align="start"
      interactive={canEditThis}
      onClick={canEditThis ? () => onEdit(c) : undefined}
    >
      <RowMain>
        <span className="flex items-start gap-1.5">
          {/* **省略記号で切らず、2行まで折り返す。** `RowTitle` の既定
              （1行で省略）は「取引先名」のような長い正式名称と相性が悪く、
              「GMOデジタルソリューションズ株式…」のように途中で切れた
              見た目が変な略称のように読めてしまう（ご指摘）。ここだけ
              `RowTitle` を使わず `line-clamp-2` を直接当てる —
              `truncate` と `line-clamp` は tailwind-merge で確実に
              打ち消し合えないため、混ぜずに書き分ける */}
          <div className="text-list min-w-0 flex-1 line-clamp-2 text-foreground">{c.name}</div>
          {/* **グループは役割の列に混ぜない** — 顧客・仕入先とは別の軸なので、
              混ぜると「グループという役割がある」と読まれる */}
          {c.is_gmo_group && <TableBadge label="グループ" w={null} variant="info" />}
        </span>
        <RowSub>{c.short_name || c.contact_name || c.email || "—"}</RowSub>
      </RowMain>
      <RowSlot w={200}><RoleBadges c={c} /></RowSlot>
      <RowSlot w={160} className="flex-col items-start">
        <span className="truncate text-sub text-secondary-foreground">{c.contact_name || "—"}</span>
        <span className="truncate text-sub-sm text-muted-foreground">{c.email || c.phone || ""}</span>
      </RowSlot>
      {/* `!canReadBudget` のときは値が無いのではなく列が見えないだけ。
          `placeholder=""` にして既定の「—」を出さない（表頭と同じ理由） */}
      <RowSlot w={160} placeholder={canReadBudget ? undefined : ""}>
        {canReadBudget ? (
          <span className="truncate text-sub text-muted-foreground">{c.invoice_registration_number || "—"}</span>
        ) : ""}
      </RowSlot>
      <RowSlot w={160}>
        <span className="flex flex-col gap-0.5">
          {c.customer_id && (
            <button
              type="button"
              className="flex items-center gap-0.5 text-sub-sm text-primary hover:underline"
              onClick={(e) => { e.stopPropagation(); onOpenCustomer(c); }}
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />取引実績
            </button>
          )}
          {c.vendor_id && canReadBudget && (
            <button
              type="button"
              className="flex items-center gap-0.5 text-sub-sm text-primary hover:underline"
              onClick={(e) => { e.stopPropagation(); onOpenVendor(c); }}
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />仕入先ページ
            </button>
          )}
        </span>
      </RowSlot>
      <RowSlot w={128}>
        {canManage && (
          <span className="flex gap-0.5">
            <Button
              variant="ghost" size="icon" title="収支サマリー"
              onClick={(e) => { e.stopPropagation(); onSummary(c); }}
            >
              <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost" size="icon" aria-label="編集"
              disabled={editBlockedByVendor}
              title={editBlockedByVendor ? "仕入先を兼ねているため、財務管理の「編集」が無いと変更できません" : "編集"}
              onClick={(e) => { e.stopPropagation(); if (canEditThis) onEdit(c); }}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            {canDelete && (
              <Button
                variant="ghost" size="icon" aria-label="削除" className="text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(c); }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </span>
        )}
      </RowSlot>
    </Row>
  );
}
