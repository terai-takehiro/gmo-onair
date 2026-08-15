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
 *
 * ── ここが「直す画面」の正でもある ──────────────────────────
 *
 * `/sales/projects/:id/edit`（案件を直す）は**この値の形と、この項目の部品
 * （`RequiredFields` / `MoreFields`）をそのまま使います**。
 * 直す画面が自前の欄を持っていた頃は、作るときに訊いた
 * 客入れの有無・案件分類・ご担当・継続区分・来場人数・案件内容・リード経路が
 * **直す画面にひとつも無く**、代わりに旧 `project_type` の1段プルダウンが
 * 残っていました（同じ案件が画面によって違う分類で見えていた）。
 *
 * → **項目を足すときはここに足すだけ**で両方の画面に出ます。
 *   どちらか片方にだけ欄を作らないこと。
 */
import type { ProjectStage } from '@/types';
import { asksAttendees, type Audience, type ProjectCategory } from '../../classification';

export interface NewProjectValues {
  customer_id: string;
  contact_name: string;
  name: string;
  /** 客入れの有無（必須）。空 = まだ選んでいない */
  audience: Audience | '';
  /** 案件分類（必須）。空 = まだ選んでいない */
  project_category: ProjectCategory | '';
  gls_category: 'A' | 'B';
  /**
   * グループ区分。**人は選びません**（migration 192・ご指示）。
   * お客様がグループ会社か（`customers.is_gmo_group`）から決まり、
   * 直す画面は**読むだけ**の欄として出します（作る画面は出しません）。
   * 見積の単価（定価 / グループ内価格）がこの値で決まります
   * （`pricing.tools.ts` / `SimulationDialog`）。
   *
   * ⚠️ **保存する値もサーバーが同じ規則で決めます。** 画面が送った値は使われません —
   * 画面とサーバーで別々に決めると、出ている区分と保存された区分が食い違います。
   */
  customer_type: 'internal' | 'external';
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

/** お客様の候補。`is_gmo_group` はリード経路を「グループ案件」に固定するために要る */
export interface CustomerOption {
  id: string;
  name: string;
  short_name?: string | null;
  /** GMOインターネットグループのグループ会社か（migration 182） */
  is_gmo_group?: boolean | null;
}

export interface UserOption { id: string; name: string }

/**
 * どちらの画面が項目を並べているか。
 *
 *   `create` … 案件作成（`/sales/projects/new`）
 *   `edit`   … 案件を直す（`/sales/projects/:id/edit`）
 *
 * **出し分けは項目の部品の中に書きます**（呼ぶ側で欄を組み直さない）。
 * 呼ぶ側に書くと、片方の画面にだけ欄が増えた状態にまた戻ります。
 */
export type FieldsMode = 'create' | 'edit';

/**
 * `RequiredFields` / `MoreFields` が要るものだけ。
 *
 * 案件作成は `useNewProjectForm`、直す画面は `useProjectForm` が
 * （react-hook-form の値を写して）これを組み立てます。
 */
export interface ProjectFieldsState {
  v: NewProjectValues;
  set: <K extends keyof NewProjectValues>(k: K, value: NewProjectValues[K]) => void;
  customers: CustomerOption[];
  users: UserOption[];
  /** お客様がグループ会社か。リード経路を「グループ案件」に固定する */
  isGroup: boolean;
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
  customer_type: 'external',
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
 * 「進んだら聞く」の畳んだ札に出す数。**来場人数は無観客のとき出ない**ので数も変わります。
 *
 *   作る画面 … ご担当・継続区分・実施日・案件内容・予算・リード経路・
 *              最初のタスク・メモ ＝ 8（＋来場人数）
 *   直す画面 … ご担当・継続区分・案件内容・予算・リード経路・グループ区分（読むだけ）＝ 6（＋来場人数）
 *
 * **`MoreFields` ではなくここに置いてあります** — 欄を足したときに数だけ
 * 直し忘れると、畳んだ札の数と中身が食い違って**開くまで気づけません**。
 * `shared/tests/projectFields.test.ts` が両方の段を固定しています。
 */
export function moreFieldCount(audience: string, mode: FieldsMode = 'create'): number {
  const base = mode === 'create' ? 8 : 6;
  return asksAttendees(audience) ? base + 1 : base;
}

/**
 * 2段分類（客入れの有無 × 案件分類）が**片方だけ**入っているか。
 *
 * サーバーは**2つ揃ったときだけ**保存します（`resolveClassification`）。
 * 片方だけ送ると導けないので**黙って捨てられ**、押した人には
 * 「選んだのに入っていない」としか見えません。だから片方入れたら片方も要ります。
 */
export function isPartialClassification(v: NewProjectValues): boolean {
  return !!v.audience !== !!v.project_category;
}

/**
 * 足りない項目。**押せなくするのではなく名指しする** —
 * 押せないボタンだけだと「何が足りないのか」を探すことになる。
 * 並びはフォームの並びと同じにする（上から順に埋めれば消える）。
 *
 * **作る画面と直す画面で同じ関数を使います。** 写すと、片方だけ必須が増えたときに
 * 「作れたのに保存できない案件」ができます。
 *
 * ⚠️ **2段分類は GLS-B のときだけ訊きません。** 工事・構築のプロジェクトには
 * 「客入れの有無」も「配信か収録か」も意味が無く、サーバーも NULL のままにします
 * （`project-classification.ts`）。
 *
 * ⚠️ **直す画面では「もともと分類が空の案件」を止めません**（ご指示）。
 *
 * migration 182 が埋め戻したのは旧 `project_type` の**4種だけ**で、
 * **`other` は列の既定値**です。つまり
 * **AI（MCP）が起こしたネタ案件・決算取込・Excel/GLS 取込で作られた案件**は
 * どれも分類が**空のまま GLS-A に残って**います。ここを必須のままにすると、
 * **案件名を直したいだけでも、知らない分類を選ばされて保存が押せません**
 * （画面には「選ぶ」と出るので、**画面が値を戻したように見えます**）。
 *
 * → **両方とも空なら通す。片方だけ入れたら、もう片方を訊く**
 *   （片方だけではサーバーが導けず、選んだ値が黙って捨てられるため）。
 *   **作る画面は今までどおり5つとも必須**です — 新しく作るものに
 *   分類が入らないと、標準工程の型が1つも当たりません。
 */
export function missingOf(v: NewProjectValues, mode: FieldsMode = 'create'): string[] {
  const asksClassification = v.gls_category !== 'B';
  // 直す画面は「まったく入っていない」ときだけ見逃す（片方だけは見逃さない）
  const needsClassification = asksClassification
    && (mode === 'create' || !!v.audience || !!v.project_category);
  return [
    v.customer_id ? null : 'お客様',
    v.name.trim() ? null : '案件名',
    !needsClassification || v.audience ? null : '客入れの有無',
    !needsClassification || v.project_category ? null : '案件分類',
    v.assigned_to ? null : '社内の担当',
  ].filter((m): m is string => m !== null);
}
