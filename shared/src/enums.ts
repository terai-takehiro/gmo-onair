// ユーザーロール
export const UserRole = {
  SYSTEM_ADMIN: 'system_admin',
  STAFF: 'staff',
  VIEWER: 'viewer',
  EXTERNAL_CLIENT: 'external_client',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserRoleLabels: Record<UserRole, string> = {
  system_admin: 'システム管理者',
  staff: '担当者',
  viewer: '閲覧者',
  external_client: '外部顧客',
};

// ヨミステージ
export const OpportunityStage = {
  LEAD: 'lead',
  PROPOSAL: 'proposal',
  NEGOTIATION: 'negotiation',
  WON: 'won',
  LOST: 'lost',
} as const;
export type OpportunityStage = (typeof OpportunityStage)[keyof typeof OpportunityStage];

export const OpportunityStageLabels: Record<OpportunityStage, string> = {
  lead: 'リード',
  proposal: '提案中',
  negotiation: '交渉中',
  won: '受注',
  lost: '失注',
};

export const OpportunityStageColors: Record<OpportunityStage, string> = {
  lead: '#94a3b8',
  proposal: '#3b82f6',
  negotiation: '#f59e0b',
  won: '#22c55e',
  lost: '#ef4444',
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
