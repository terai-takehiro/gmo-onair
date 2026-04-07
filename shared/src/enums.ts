// ユーザーロール
export const UserRole = {
  SYSTEM_ADMIN: 'system_admin',
  STAFF: 'staff',
  EQUIPMENT_STAFF: 'equipment_staff',
  VIEWER: 'viewer',
  EXTERNAL_CLIENT: 'external_client',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserRoleLabels: Record<UserRole, string> = {
  system_admin: 'システム管理者',
  staff: '担当者',
  equipment_staff: '機材担当',
  viewer: '閲覧者',
  external_client: '外部顧客',
};

// 案件種類
export const ProjectType = {
  OFFLINE_EVENT: 'offline_event',
  HYBRID_EVENT: 'hybrid_event',
  LIVE_BROADCAST: 'live_broadcast',
  RECORDING: 'recording',
  GMO_PROJECT: 'gmo_project',
  CONSULTING: 'consulting',
  OTHER: 'other',
} as const;
export type ProjectType = (typeof ProjectType)[keyof typeof ProjectType];

export const ProjectTypeLabels: Record<ProjectType, string> = {
  offline_event: 'オフラインイベント',
  hybrid_event: 'ハイブリットイベント',
  live_broadcast: '生放送',
  recording: '収録',
  gmo_project: 'GMO案件',
  consulting: 'コンサルティング',
  other: 'その他',
};

export const PROJECT_CATEGORY_A: ProjectType[] = ['offline_event', 'hybrid_event', 'live_broadcast', 'recording'];
export const PROJECT_CATEGORY_B: ProjectType[] = ['gmo_project', 'consulting', 'other'];

// 料金計算タイプ
export const CalcType = {
  DAYS: 'days',
  HOURS: 'hours',
  FIXED: 'fixed',
  DAYS_QTY: 'days_qty',
  DAYS_PEOPLE: 'days_people',
  TOGGLE: 'toggle',
} as const;
export type CalcType = (typeof CalcType)[keyof typeof CalcType];

export const CalcTypeLabels: Record<CalcType, string> = {
  days: '日数×単価',
  hours: '時間×単価',
  fixed: '固定',
  days_qty: '台数×日数×単価',
  days_people: '人数×日数×単価',
  toggle: '有無×単価',
};

// 案件ステータス
export const ProjectStatus = {
  TENTATIVE: 'tentative',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const ProjectStatusLabels: Record<ProjectStatus, string> = {
  tentative: '仮',
  confirmed: '確定',
  completed: '完了',
  cancelled: '中止',
};

export const ProjectStatusColors: Record<ProjectStatus, string> = {
  tentative: '#f59e0b',
  confirmed: '#005bac',
  completed: '#22c55e',
  cancelled: '#ef4444',
};

// 税区分
export const TaxCategory = {
  TAX10: 'tax10',
  TAX8: 'tax8',
  EXEMPT: 'exempt',
} as const;
export type TaxCategory = (typeof TaxCategory)[keyof typeof TaxCategory];

export const TaxCategoryLabels: Record<TaxCategory, string> = {
  tax10: '10%課税',
  tax8: '8%課税(軽減)',
  exempt: '非課税',
};

// 精算方法
export const SettlementMethod = {
  RAKURAKU: 'rakuraku',
  XPOINT: 'xpoint',
  OTHER: 'other',
} as const;
export type SettlementMethod = (typeof SettlementMethod)[keyof typeof SettlementMethod];

export const SettlementMethodLabels: Record<SettlementMethod, string> = {
  rakuraku: '楽楽精算',
  xpoint: 'X-Point',
  other: 'その他',
};

// 番組種別
export const BroadcastType = {
  LIVE: 'live',
  RECORDING: 'recording',
} as const;
export type BroadcastType = (typeof BroadcastType)[keyof typeof BroadcastType];

export const BroadcastTypeLabels: Record<BroadcastType, string> = {
  live: '生放送',
  recording: '収録',
};

// 配信媒体
export const MediaPlatform = {
  YOUTUBE: 'youtube',
  TERRESTRIAL_TV: 'terrestrial_tv',
  NET_MEDIA: 'net_media',
  ZOOM: 'zoom',
  TEAMS: 'teams',
  OTHER: 'other',
} as const;
export type MediaPlatform = (typeof MediaPlatform)[keyof typeof MediaPlatform];

export const MediaPlatformLabels: Record<MediaPlatform, string> = {
  youtube: 'YouTube',
  terrestrial_tv: '地上波TV',
  net_media: 'ネットメディア',
  zoom: 'ZOOM',
  teams: 'Teams',
  other: 'その他',
};

// 請求グループステータス
export const InvoiceGroupStatus = {
  DRAFT: 'draft',
  SENT: 'sent',
  PAID: 'paid',
} as const;
export type InvoiceGroupStatus = (typeof InvoiceGroupStatus)[keyof typeof InvoiceGroupStatus];

export const InvoiceGroupStatusLabels: Record<InvoiceGroupStatus, string> = {
  draft: '下書き',
  sent: '送付済',
  paid: '入金済',
};

export const InvoiceGroupStatusColors: Record<InvoiceGroupStatus, string> = {
  draft: '#94a3b8',
  sent: '#f59e0b',
  paid: '#22c55e',
};
