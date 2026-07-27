// 案件フォームの型・定数・小さな計算 (v2.9.292 で ProjectFormPage.tsx から切り出し)
//
// 切り出しの目的は**行数を減らすことではなく、探せるようにすること**。
// 2,513 行の 1 ファイルだと「この定数はどこで使われているか」を追うのに
// ファイル内検索しか手が無く、変更の影響範囲が読めない。
//
// **中身は 1 行も変えていない** (移動のみ)。
import type { ProjectStage } from '@/types';

export interface LostDialogState {
  open: boolean;
  lost_reason: string;
  lost_reason_note: string;
  lessons_learned: string;
}

export interface FormValues {
  name: string;
  customer_id: string;
  customer_type: string;
  project_type: string;
  project_type_other: string;
  /** 'A' = スタジオ案件 (GLS-A) / 'B' = ビジネス案件 (GLS-B) */
  gls_category: '' | 'A' | 'B';
  event_start: string;
  event_end: string;
  expected_amount: number;
  assigned_to: string;
  broadcast_type: string;
  media_platform: string;
  tags: string;
  notes: string;
  box_url_internal: string;
  box_url_external: string;
  application_form: boolean;
  logo_permission: boolean;
}

export interface GlsDialogState {
  open: boolean;
  mode: 'new' | 'link';
  broadcast_types: string[];
  media_platforms: string[];
  target_project_id: string;
}

/**
 * inclusive な終了日 (YYYY-MM-DD) を 1 日進めて exclusive-end に変換する。
 * StudioBookingDialog / FullCalendar は終日イベントの end を exclusive (end-1 が最終日)
 * として扱うため、案件の event 日付 (inclusive) を presetDate に渡すときはこれで揃える。
 * toISOString() の UTC 変換によるズレを避けるためローカル日付演算で計算。
 */
export function addOneDayStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}

// v2.9.219+: ジャーニーステッパー — ゴール(受注→完了)から逆算した現在地を可視化。
// 案件のステージ順 (ネタ→仮押さえ→見積提案→口頭決定→受注→完了) を並べ、
// 現在地を強調・通過済みにチェック。失注 (e_lost) は本線から外れた終端として別表示。
export const JOURNEY_STAGES: ProjectStage[] = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 's_completed'];
export const JOURNEY_SHORT: Record<ProjectStage, string> = {
  neta: 'ネタ', d_hold: '仮押さえ', c_proposal: '見積提案', b_verbal: '口頭決定',
  a_won: '受注', s_completed: '完了', e_lost: '失注',
};
/**
 * ジャーニー (7a) — 6段の現在地を日付つきで出し、**次の一手を1つだけ**主ボタンにする。
 * 他のステージは「ほかのステージ」に畳む (選択肢を10個並べると人は選べない)。
 * 失注は本線から外れた終端として別扱い。
 */
export const NEXT_STAGE_LABEL: Partial<Record<ProjectStage, { to: ProjectStage; label: string; note: string }>> = {
  neta: { to: 'd_hold', label: '仮押さえにする', note: 'いまネタ。日程を押さえる目処が立ったら「仮押さえ」に進めてください。' },
  d_hold: { to: 'c_proposal', label: '見積提案にする', note: 'いま仮押さえ。見積を出したら「見積提案」に進めてください。' },
  c_proposal: { to: 'b_verbal', label: '口頭決定にする', note: 'いま見積提案。お客様の合意が取れたら「口頭決定」に進めてください。' },
  b_verbal: { to: 'a_won', label: '受注にする', note: 'いま口頭決定。正式受注が固まったら「受注」に進めてください。見積・売上の明細登録はそこから始まります。' },
  a_won: { to: 's_completed', label: '完了にする', note: 'いま受注済。実施と請求が終わったら「完了」にしてください。' },
};