/**
 * まとめて直すときに**サーバーへ送る中身**を作る（案件台帳）
 *
 * ── なぜ画面（`BulkEditDialog.tsx`）から出しているか ────────────
 *
 * ここは**取り消せない書き換えの中身そのもの**です。間違えても画面には出ません
 * （N 件が黙って別の値になるだけ）。部品の中に置くと `@/` の別名を通してしか
 * 読めず、**試験が書けません**。純粋な関数として出しておき、
 * `shared/tests/projectLedger.test.ts` で1つずつ固定します。
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 *  ・**`null` を返したら押させない。** 「まだ何も選んでいない」と
 *    「空にしたい」を分けます
 *  ・⚠️ **分類は2つ揃ったときだけ返す。** サーバーは2つ揃ったときだけ保存するので
 *    （`resolveClassification`）、片方だけ送ると**黙って捨てられ**、
 *    押した人には「選んだのに入っていない」としか見えません
 *  ・**旧 `project_type` は送らない。** サーバーが2段から導きます
 *    （両方送ると、分類と種類がずれた行ができる）
 */
import type { BulkFieldKey } from './types';

export interface BulkInput {
  audience: string;
  category: string;
  text: string;
  flag: string;
}

export function buildBulkSet(field: BulkFieldKey, v: BulkInput): Record<string, unknown> | null {
  switch (field) {
    case 'classification':
      if (!v.audience || !v.category) return null;
      return { audience: v.audience, project_category: v.category };
    case 'assigned_to':
      return v.text ? { assigned_to: v.text } : null;
    case 'customer_id':
      return v.text ? { customer_id: v.text } : null;
    case 'event_start':
      return v.text ? { event_start: v.text } : null;
    case 'event_end':
      return v.text ? { event_end: v.text } : null;
    case 'application_form':
      return v.flag ? { application_form: v.flag === '1' } : null;
    default:
      return null;
  }
}
