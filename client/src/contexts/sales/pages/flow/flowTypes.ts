/** ⑦ 標準工程テンプレート（案件）で使う形 */

export type FlowAnchor = 'intake' | 'event';

export interface FlowTask {
  id: string;
  phase_id: string;
  title: string;
  /** 担当の**職種**。人ではない（v4 は案件担当者という概念を持たない） */
  role: string | null;
  anchor: FlowAnchor;
  /** 符号つき。実施日の60日前 = -60 */
  offset_days: number;
  is_required: boolean;
  sort_order: number;
}

export interface FlowPhase { id: string; name: string; sort_order: number; tasks: FlowTask[] }

export interface FlowTemplate {
  id: string;
  name: string;
  description: string | null;
  /** この型を使う案件の種類。**空 = すべての種類** */
  project_types: string[];
  is_system: boolean;
  sort_order: number;
  phases: FlowPhase[];
}

export interface PreviewTask extends FlowTask {
  phase_name: string;
  /** 出せないときは null（実施日が未定など） */
  due: string | null;
  /** 「実施日 -60 日」の読める文 */
  when: string;
}

/** モックの職種。**自由入力にしない** — 表記が揺れると絞り込めなくなる */
export const ROLES = ['営業', 'プロデューサー', 'テクニカル', '全員'] as const;

export const ROLE_TONE: Record<string, string> = {
  営業: 'bg-primary-surface text-primary',
  プロデューサー: 'bg-ai-surface text-ai',
  テクニカル: 'bg-info-surface text-info',
  全員: 'bg-warning-surface text-warning',
};
