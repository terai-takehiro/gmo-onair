/**
 * 売上ダイアログの「どこへ・誰あてに保存するか」を決める（③ 売上）
 *
 * ── なぜ切り出したか ──────────────────────────────────────
 *
 * `RevenueDialog.tsx` が1ファイル400行の上限ぎりぎりなのが直接の理由ですが、
 * それ以上に**「保存できる／できない」を決めているのがここ1か所だけ**だからです。
 * 描き方（どのフォーム部品を並べるか）とは別の決めごとなので分けました。
 *
 * ── 直しに来たときは案件を検索し直さない（この回の修正の本体）──────
 *
 * 元の実装は、直している売上の**顧客ID（保存の必須項目）を案件名で
 * `/projects` を引き直した結果**から取っていました。その検索は
 * `stage=a_won,s_completed`（受注済み以降だけ）で絞っているので、
 * 候補が返らない行では顧客IDが取れず、`canSubmit` が永久に false ＝
 * **「更新」ボタンが灰色のまま押せません**。押しても何も起きず、
 * エラーも出ないので「入力は出来るが保存ができない」という報告になりました。
 *
 * 候補が返らないのは珍しい状況ではありません:
 *   ・受注前（`b_verbal` など）の案件 — 案件詳細の売上・請求ペインは
 *     見込み（`status='estimate'`）の売上も並べるので、その鉛筆は必ずこうなる
 *   ・顧客未設定の案件
 *   ・同名の案件が20件を超えて候補から溢れた場合
 *   ・開いた直後（300ms のデバウンス＋往復の間）
 *
 * **受注済みだけを候補にする決めごと（v4.1.8）は「新規登録」のための仕様**です。
 * 既にある行を直すときまで同じ関門を掛けているのが誤りでした。直しに来たときは、
 * その行が既に持っている案件・請求先をそのまま使います
 * （`RevenueRow.customer_id` — サーバーは前から返しています）。
 *
 * ── 押せない理由は必ず画面に出す ────────────────────────────
 *
 * 灰色のボタンだけ置くと、利用者には「壊れている」としか見えません。
 * `blockReason` を返して、ボタンの上に理由と次の手を書きます。
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { ProjectOption, RevenueRow } from './types';

export interface RevenueEditTarget {
  /** 保存先の案件。**編集時は検索結果に無くても解決できる** */
  selectedProject: ProjectOption | undefined;
  /** 保存に使う請求先（`companies.id`）。取れなければ null */
  customerId: string | null;
  /** 空でなければ保存できない。**そのまま画面に出す文言** */
  blockReason: string;
}

export function useRevenueEditTarget({
  editing, selectedProjectId, selectedProjectObj, projects,
}: {
  /** 直している行。`null` なら新規登録 */
  editing: RevenueRow | null;
  selectedProjectId: string;
  /** 候補一覧から選んだ案件（選んだ直後は検索結果より確か） */
  selectedProjectObj: ProjectOption | null;
  /** 案件名の検索結果（受注済み以降だけ） */
  projects: ProjectOption[];
}): RevenueEditTarget {
  /*
   * 直している行の案件は **id で1件だけ直に引く**（名前検索・ステージ絞りを通さない）。
   * 鍵を `['project', id]`（案件詳細が使う）と分けているのは、あちらが
   * `staleTime:0` / `refetchOnMount:'always'` で毎回引き直す設定になっており、
   * ダイアログを開くたびに案件詳細まで再取得させないためです。
   */
  const { data: editingProjectData } = useQuery({
    queryKey: ['project-for-revenue', editing?.project_id],
    queryFn: async () => (await api.get(`/projects/${editing!.project_id}`)).data,
    enabled: !!editing?.project_id,
  });
  const editingProject: ProjectOption | undefined = editingProjectData?.data;

  const selectedProject =
    (selectedProjectObj && selectedProjectObj.id === selectedProjectId ? selectedProjectObj : undefined)
    ?? projects.find((p) => p.id === selectedProjectId)
    // 最後の砦。**編集時だけ**効く（新規は上の2つ＝受注済みの候補からしか解決しない）
    ?? (editingProject && editingProject.id === selectedProjectId ? editingProject : undefined);

  /*
   * 請求先は「案件の顧客」ではなく**その売上行が持っている請求先**を先に見ます。
   * 見積の時点で案件の顧客とは違う会社あてにしている行があり、案件の顧客で
   * 上書きすると**請求書の宛先が黙って変わります**。行が持っていないときだけ
   * 案件の顧客に落とします（従来どおり）。
   */
  const customerId =
    (editing && selectedProjectId === editing.project_id ? editing.customer_id : null)
    ?? selectedProject?.customer_id ?? null;

  return { selectedProject, customerId, blockReason: submitBlockReason(editing, selectedProjectId, customerId) };
}

/** 保存できない理由。**画面にそのまま出す**ので、次に何をすればよいかまで書く */
function submitBlockReason(editing: RevenueRow | null, selectedProjectId: string, customerId: string | null): string {
  if (!selectedProjectId) return '案件を選んでください。';
  // サーバー `PUT /revenues/:id` が 400（REVENUE_IN_ALLOCATION_GROUP）で止める条件。
  // **押してから断られるのをやめる** — 按分の内訳を直せないので合計だけ変えられない
  if (editing?.group_id) {
    return 'この売上は費用を分け合うグループに入っています。案件管理 > 費用を分け合うグループの画面から直してください。';
  }
  if (!customerId) {
    return editing
      ? 'この売上に請求先（顧客）が入っておらず、案件にも顧客が設定されていないため保存できません。案件を直すから顧客を設定してください。'
      : '選んだ案件に顧客が設定されていないため保存できません。案件を直すから顧客を設定してください。';
  }
  return '';
}
