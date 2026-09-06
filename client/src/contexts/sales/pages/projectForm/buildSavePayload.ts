/**
 * 案件を直す保存で「送ってはいけない項目」を落とす純粋な変換。
 * `useProjectForm.ts` を 400 行以内に収めるための切り出し（`saveMutation` の
 * `mutationFn` からそのまま移しただけで、判断の中身は変えていない）。
 */
import type { FormValues } from './types';

export function buildSavePayload(
  values: FormValues,
  { isGroup, isEdit }: { isGroup: boolean; isEdit: boolean },
): Record<string, unknown> {
  // **主担当を空にしたら送らない。** `projects.assigned_to` は NOT NULL の外部キーで、
  // 空文字を渡すと FK 違反で 500 になる（`SearchableSelect` の × を押すと空になる）。
  // 送らなければサーバーは既存の値を保つ
  const body: Record<string, unknown> = { ...values };
  if (!values.assigned_to) delete body.assigned_to;

  /**
   * **旧1段の案件種類は送らない。** この画面はもう欄を持っておらず、
   * `project_type` はサーバーが2段（客入れの有無 × 案件分類）から導きます。
   * 読み込んだ値をそのまま送り返すと、2段を直しても**古い種類が一緒に来て**
   * 分類と種類がずれた行ができます（`project-classification.ts`）。
   * 送らなければサーバーは今の値を保ちます（2段が揃っていればそちらが勝つ）。
   */
  delete body.project_type;

  /**
   * **2段が空なら送らない。** GLS-B（工事・構築）は2段を持たないので、
   * 空文字を送るとサーバーが「分類を消したい」と受け取ります。
   */
  if (!values.audience) delete body.audience;
  if (!values.project_category) delete body.project_category;

  /**
   * グループ会社のときはリード経路を固定で送る（案件作成と同じ）。
   * 画面が「グループ案件」と出している以上、保存される値も同じでなければ
   * あとから数えたときに食い違います。
   */
  if (isGroup) body.intake_channel = 'group';
  // **グループ区分は送らない**（migration 192）— 決めるのはサーバー（お客様から導く）
  delete body.customer_type;

  /**
   * **事業主体は空なら `null` で送る**（migration 282）。`null` は「自動に戻す」で、
   * サーバーが人の上書きの印（`entity_manual`）を外してお客様の区分から決め直す。
   * 送らない（`undefined`）と今の値を保つので、「自動」を選び直した人の操作が
   * 黙って無視される。案件作成側は逆に空を送らない（`useCreateProject.ts`）
   */
  body.entity = values.entity || null;

  /**
   * **新しく作るときだけ「入口」を送る** (migration 165)。
   * ダッシュボードの受付カードから「電話・打合せを取り込む」で来ると
   * `?intake=phone` が付いているので、それを引き継ぐ。
   * **確信 (`intake_confidence`) は送らない** — 人が入れた案件に
   * AI の見立てを付けると、受付の読む順が狂う
   */
  if (!isEdit) {
    const intake = new URLSearchParams(window.location.search).get('intake');
    if (intake) body.intake_channel = intake;
  }

  return body;
}
