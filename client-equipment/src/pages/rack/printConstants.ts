/**
 * ラック図の寸法と型（v4 大④でファイルから切り出し・**値は1つも変えていない**）
 *
 * **印刷の値は実機で合わせたもの**です。`PRINT_U_H` を上げると A4 縦に収まらず、
 * 1ページ目で切れます（`PRINT_RACK_BODY_BUDGET_PX` はその安全値）。
 */
// ── Constants ─────────────────────────────────────────────────────────────────
export const CELL_H = 32;
export const RACK_W = 240;
export const PRINT_U_H = 20;  // 基準 px/U（A4縦に余裕を持って収まる最大値）
export const PRINT_U_H_MIN = 8; // 文字が読める最低 px/U（これ以下にはしない）
export const PRINT_RACK_BODY_BUDGET_PX = 850; // ラック本体に割り当てるA4縦の最大高（chrome除く安全値）
export const PRINT_RACK_W = 290; // px for rack body in print (2 racks fit A4 portrait)

// ── Cell display config ───────────────────────────────────────────────────────
export type CellConfig = {
  primary: "model" | "name" | "custom";
  showName: boolean;
  showModel: boolean;
  showNo: boolean;
  showCustom: boolean;
  customText: string;
};

// ── Rack subtitle config ──────────────────────────────────────────────────────
export type RackConfig = {
  subtitleMode: "auto" | "hidden" | "custom";
  subtitleText: string;
};

export const RACK_CONFIG_LS_KEY = "rack-header-configs-v1";

/** パネルの種別の呼び方（表に出すとき）。図の中の描き方とは別 */
export const PANEL_LABEL: Record<string, string> = {
  blank: "ブランクパネル", cable: "通線口", drawer: "引き出し", custom: "自由記述",
};

export function loadRackConfigs(): Record<string, RackConfig> {
  try { return JSON.parse(localStorage.getItem(RACK_CONFIG_LS_KEY) ?? "{}"); }
  catch { return {}; }
}

export function saveRackConfigs(configs: Record<string, RackConfig>) {
  localStorage.setItem(RACK_CONFIG_LS_KEY, JSON.stringify(configs));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function slotToColumn(slot: string): { start: number; span: number } {
  switch (slot) {
    case "left-1_2":  return { start: 1, span: 3 };
    case "right-1_2": return { start: 4, span: 3 };
    case "left-1_3":  return { start: 1, span: 2 };
    case "mid-1_3":   return { start: 3, span: 2 };
    case "right-1_3": return { start: 5, span: 2 };
    default:          return { start: 1, span: 6 };
  }
}


