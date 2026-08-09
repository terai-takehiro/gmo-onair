/**
 * 案件作成の項目（v4・migration 165/170/181）
 *
 * ── 「受付」と「案件登録」を1画面にした ──────────────────────
 *
 * 受付（旧 `/sales/inbox`）と案件登録は**同じ仕事**でした。届いたものを読んで、
 * 足りないところを埋めて、案件にするかどうかを決める。2画面に分けていたので
 * 「受付で確かめてから登録画面でもう一度同じ項目を入れる」ことになっていました。
 * → **1画面**にして、上に「自動で届いたもの」のレール、下にフォームを置きます。
 *
 * ── 必須は5つだけ ──────────────────────────────────────────
 *
 *   お客様 ／ 案件名 ／ 客入れの有無 ／ 案件分類 ／ 社内の担当
 *
 * 残りは「進んだら聞く」に畳みます。**電話を切る前に入れ終わる**のが目標なので、
 * 最初の画面に並ぶものを減らします（畳んだものも1回押せば全部出ます）。
 *
 * ── この版で削った2つ ───────────────────────────────────────
 *
 *  ・**返事の期限**（`reply_due`）… タスクの期限と役割が重なっており、
 *    どちらに入れるか毎回迷う欄でした。相手を待たせているものは
 *    「最初のタスク」に期限付きで入れれば、期限切れとして拾われます。
 *    **列は消していません** — 既に入っている値は案件詳細から読めます
 *  ・**求められているもの**（`wants`）… 「見積」「資料」と書いても、
 *    次にやることが決まるわけではありませんでした（決まるのはタスク）
 *
 * ── 改名した3つ（言葉だけ・列は同じ）─────────────────────────
 *
 *   やりたいこと → **案件内容**（`goal`）
 *   規模         → **来場人数**（`attendee_count`）… 無観客のときは欄ごと出さない
 *   入手経路     → **リード経路**（`intake_channel`）
 *
 * ── GLS 番号はここで発番しない ──────────────────────────────
 *
 * ボタンは「**案件にする（与件化）**」です。GLS は**受注が固まった時点**で採ります
 * （案件詳細から）。ここで採ると、まだ受注していないものに正式な番号が並びます。
 */
import type { ProjectStage } from '@/types';
import type { Audience, ProjectCategory } from '../../classification';

export interface NewProjectValues {
  customer_id: string;
  contact_name: string;
  name: string;
  /** 客入れの有無（必須）。空 = まだ選んでいない */
  audience: Audience | '';
  /** 案件分類（必須）。空 = まだ選んでいない */
  project_category: ProjectCategory | '';
  gls_category: 'A' | 'B';
  recurrence: 'single' | 'regular';
  stage: ProjectStage;
  dates: string[];
  attendee_count: string;
  goal: string;
  expected_amount: string;
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
  // **既定を入れない。** 入れると「選んだ」と「選んでいない」が見分けられず、
  // 押す人が確かめないまま標準工程がその分類で立ちます
  audience: '',
  project_category: '',
  gls_category: 'A',
  recurrence: 'single',
  stage: 'neta',
  dates: [],
  attendee_count: '',
  goal: '',
  expected_amount: '',
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

/**
 * 足りない項目。**押せなくするのではなく名指しする** —
 * 押せないボタンだけだと「何が足りないのか」を探すことになる。
 * 並びはフォームの並びと同じにする（上から順に埋めれば消える）。
 */
export function missingOf(v: NewProjectValues): string[] {
  return [
    v.customer_id ? null : 'お客様',
    v.name.trim() ? null : '案件名',
    v.audience ? null : '客入れの有無',
    v.project_category ? null : '案件分類',
    v.assigned_to ? null : '社内の担当',
  ].filter((m): m is string => m !== null);
}
