export const TYPE_CODES = [
  { code: "V",  label: "映像" },
  { code: "C",  label: "カメラ" },
  { code: "A",  label: "音声" },
  { code: "IC", label: "インカム" },
  { code: "NW", label: "ネットワーク" },
  { code: "L",  label: "照明" },
  { code: "XR", label: "LED/XR" },
  { code: "E",  label: "設備/その他" },
];

export const ASSET_CLASS_OPTIONS = [
  { value: "fixed_asset", label: "固定資産" },
  { value: "consumable",  label: "消耗品" },
  { value: "leased",      label: "リース" },
  { value: "transferred", label: "譲渡" },
];

export const ASSET_CLASS_LABELS: Record<string, string> = {
  fixed_asset: "固定資産", consumable: "消耗品", leased: "リース", transferred: "譲渡",
};

export const SECTIONS = [
  { value: "equipment", label: "設備" },
  { value: "rental",    label: "貸出" },
];

export const LOC_CODES = [
  { value: "Y", label: "用賀" },
  { value: "S", label: "渋谷" },
];

export const RACK_SLOT_OPTIONS = [
  { value: "full",      label: "全幅" },
  { value: "left-1_2",  label: "左1/2" },
  { value: "right-1_2", label: "右1/2" },
  { value: "left-1_3",  label: "左1/3" },
  { value: "mid-1_3",   label: "中央1/3" },
  { value: "right-1_3", label: "右1/3" },
];

export const STATUS_OPTIONS = [
  { value: "active",    label: "稼働中" },
  { value: "in_repair", label: "修理中" },
  { value: "retired",   label: "引退" },
  { value: "disposed",  label: "廃棄" },
  { value: "lost",      label: "紛失" },
];

export const CONDITION_OPTIONS = [
  { value: "excellent", label: "優良" },
  { value: "good",      label: "良好" },
  { value: "fair",      label: "可" },
  { value: "poor",      label: "不良" },
];

export const TYPE_LABELS: Record<string, string> = {
  V: "映像", C: "カメラ", A: "音声", IC: "インカム",
  NW: "ネットワーク", L: "照明", XR: "LED/XR", E: "設備",
};

export const SECTION_LABELS: Record<string, string> = {
  equipment: "設備", rental: "貸出",
};

export const TYPE_BORDER_COLOR: Record<string, string> = {
  V: '#7c3aed', C: '#0284c7', A: '#d97706', IC: '#0d9488',
  NW: '#0891b2', L: '#ca8a04', XR: '#db2777', E: '#6b7280',
};

export const TYPE_BG: Record<string, string> = {
  V: "#ede9fe", C: "#e0f2fe", A: "#fef9c3", IC: "#ccfbf1",
  NW: "#cffafe", L: "#fefce8", XR: "#fce7f3", E: "#f3f4f6",
};

export const CONDITION_LABELS: Record<string, string> = {
  excellent: "新品同様", good: "良好", fair: "普通", poor: "要注意",
};
