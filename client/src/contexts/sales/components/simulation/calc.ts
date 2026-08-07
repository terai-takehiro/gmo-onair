/**
 * 見積シミュレーションの計算と単位（v4 大③でファイルから切り出し）
 *
 * **画面を持たない部分**なので分けてあります。小計の出し方は
 * サーバー (`simulations.routes.ts`) と噛み合っている値なので、
 * ここを触ると保存後の金額とその場の表示がずれます。
 */
import type { CalcType } from "@/types";

export interface ItemState {
  checked: boolean;
  quantity: number;
  days: number;
  unitPrice: number;
}

export function calcSubtotal(calcType: CalcType, state: ItemState): number {
  if (!state.checked) return 0;
  switch (calcType) {
    case "days": return state.days * state.unitPrice;
    case "hours": return state.days * state.unitPrice;
    case "fixed": return state.unitPrice;
    case "days_qty": return state.quantity * state.days * state.unitPrice;
    case "days_people": return state.quantity * state.days * state.unitPrice;
    case "toggle": return state.unitPrice;
    case "qty": return state.quantity * state.unitPrice;
    default: return 0;
  }
}

export const calcTypeUnit: Record<string, { qtyLabel?: string; daysLabel: string }> = {
  days: { daysLabel: "日" },
  hours: { daysLabel: "時間" },
  fixed: { daysLabel: "" },
  days_qty: { qtyLabel: "台", daysLabel: "日" },
  days_people: { qtyLabel: "人", daysLabel: "日" },
  toggle: { daysLabel: "" },
  qty: { qtyLabel: "数", daysLabel: "" },
};

