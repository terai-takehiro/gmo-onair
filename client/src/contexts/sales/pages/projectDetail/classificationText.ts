/**
 * 概要タブの「案件分類」に出す1行（v4・migration 182/193）
 *
 * ── なぜ関数に切り出してあるか ──────────────────────────────
 *
 * 案件分類は**2つの持ち方が併存**しています（`project-classification.ts` の冒頭）:
 *
 *   旧 `project_type`（1段・7種）          … 一覧・Excel・標準工程・集計が読む
 *   `audience` / `project_category`（2段） … v4 の画面が読む
 *
 * **どちらを出すかの判断が、そのまま「登録済みに見えるか」を決めます。**
 * 実際にご指摘をいただいた壊れ方がこれでした:
 *
 *   ⚠️ **概要タブは旧種類を案件分類として出していた**ので **登録済みに見える**
 *   ⚠️ **案件を直す画面は2段しか見ない**ので **「選ぶ」＝未登録に見える**
 *   → **同じ案件が、画面によって登録済みと未登録に見えていました。**
 *
 * ── 決めごと3つ ────────────────────────────────────────────
 *
 *  1. **2段が揃っていればそれを出す**（`classificationLabel`。片方だけなら出さない）
 *  2. **旧種類が `other` のときは出さない。** `projects.project_type` の
 *     **既定値が `other`** なので、「その他だと決めた案件」と
 *     「**まだ決めていない案件**」が同じ値になります（AI が起こしたネタ・
 *     決算取込・投入口からできた案件はすべて後者）。出すと、
 *     **決めていないものが登録済みに見えます**。空欄（—）にして、
 *     案件を直す画面と同じことを言います
 *  3. **GLS-B の値（GMO案件・コンサル）は出す。** 工事・構築のプロジェクトは
 *     2段を持たない決めごとなので、**そちらでは旧種類が案件分類そのもの**です
 *     （直す画面もそう書いています）
 *
 * **旧種類 → 2段の対応表はここに書きません**（サーバーの1か所が正）。
 * ここがやるのは「出すか出さないか」と、旧種類の**名前**を引くことだけです。
 */
import { ProjectTypeLabels } from '@/types';
import { classificationLabel } from '@/contexts/sales/classification';

export function classificationText(project: {
  audience?: string | null;
  project_category?: string | null;
  project_type?: string | null;
}): string | null {
  const both = classificationLabel(project.audience, project.project_category);
  if (both) return both;
  const type = project.project_type;
  if (!type || type === 'other') return null;
  return ProjectTypeLabels[type as keyof typeof ProjectTypeLabels] ?? type;
}
