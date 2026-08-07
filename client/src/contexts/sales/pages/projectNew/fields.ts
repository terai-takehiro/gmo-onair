/**
 * 案件登録の16項目 (v4・モックの `inManualFields`・migration 165/170)
 *
 * ── 並びと必須はモックのまま ────────────────────────────────
 *
 *   1 お客様 *          2 ご担当              3 案件名 *
 *   4 案件の種類 *      5 継続区分 *          6 ステージ *
 *   7 実施日            8 会場・スタジオ      9 規模
 *  10 やりたいこと     11 予算               12 返事の期限
 *  13 求められているもの 14 入手経路          15 最初のタスク
 *  16 メモ
 *
 * ── 8「会場・スタジオ」はここでは選べません ──────────────────
 *
 * 部屋を押さえるのは `studio_bookings` への書き込みで、**空きの確認が要ります**。
 * 登録の流れに混ぜると、押さえられなかったときに案件だけできて
 * 「押さえたつもり」になります。作ったあとにカレンダーから押さえます。
 * その旨を画面に書いてあります（項目自体は出す — 無いと「入れ忘れた」と思われる）。
 *
 * ── 6「ステージ」は受注以降を選べません ──────────────────────
 *
 * 受注にすると GLS 番号を採ります（確認ダイアログ付き）。登録の流れで
 * 採ってしまうと、番号を見せてから確認する仕掛けを飛ばします。
 */
import type { ProjectStage } from '@/types';

export interface NewProjectValues {
  customer_id: string;
  contact_name: string;
  name: string;
  project_type: string;
  gls_category: 'A' | 'B';
  recurrence: 'single' | 'regular';
  stage: ProjectStage;
  dates: string[];
  attendee_count: string;
  goal: string;
  expected_amount: string;
  reply_due: string;
  wants: string;
  intake_channel: string;
  assigned_to: string;
  first_task_title: string;
  first_task_due: string;
  notes: string;
}

export const EMPTY_NEW_PROJECT: NewProjectValues = {
  customer_id: '',
  contact_name: '',
  name: '',
  project_type: 'live_broadcast',
  gls_category: 'A',
  recurrence: 'single',
  stage: 'neta',
  dates: [],
  attendee_count: '',
  goal: '',
  expected_amount: '',
  reply_due: '',
  wants: '',
  intake_channel: '',
  assigned_to: '',
  first_task_title: '',
  first_task_due: '',
  notes: '',
};

/** 登録で選べるステージ。**受注以降は出さない**（GLS の発番を飛ばすため） */
export const CREATABLE_STAGES: ProjectStage[] = ['neta', 'd_hold', 'c_proposal', 'b_verbal'];

export const RECURRENCE_LABEL: Record<'single' | 'regular', string> = {
  single: '単発',
  regular: 'レギュラー（回を持つ）',
};

/** 求められているものの候補。**自由入力もできる**ようにテキストで持つ */
export const WANTS_HINTS = ['見積', '資料', '見積 と 資料', '相場感', '空き状況'];

/**
 * 足りない項目。**押せなくするのではなく名指しする** —
 * 押せないボタンだけだと「何が足りないのか」を探すことになる。
 */
export function missingOf(v: NewProjectValues): string[] {
  return [
    v.customer_id ? null : 'お客様',
    v.name.trim() ? null : '案件名',
    v.project_type ? null : '案件の種類',
    v.assigned_to ? null : '社内の担当',
  ].filter((m): m is string => m !== null);
}
