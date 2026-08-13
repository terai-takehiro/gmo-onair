/**
 * やり取りの種類の見せ方（1か所）
 *
 * **やり取りタブと概要タブのダイジェストが同じ表を読みます。**
 * 書き写すと、片方だけ直したときに**同じ記録が画面によって違う名前で出ます**
 * （案件作成のレールとホームの「お待たせ中」で `inbox/kinds.ts` を共有しているのと同じ理由）。
 */
import { Phone, Mail, Users, Presentation, Pencil, MoreHorizontal } from 'lucide-react';

/** **DB の `activity_type` と同じ集合**（migration 184 で `memo` を足した） */
export const KIND: Record<string, { label: string; icon: typeof Phone }> = {
  call: { label: '電話', icon: Phone },
  email: { label: 'メール', icon: Mail },
  meeting: { label: '打合せ', icon: Users },
  visit: { label: '訪問', icon: Users },
  proposal: { label: '提案', icon: Presentation },
  demo: { label: 'デモ', icon: Presentation },
  followup: { label: '追いかけ', icon: MoreHorizontal },
  follow_up: { label: '追いかけ', icon: MoreHorizontal },
  memo: { label: 'メモ', icon: Pencil },
  other: { label: 'その他', icon: MoreHorizontal },
};

export function kindOf(activityType?: string | null) {
  return KIND[activityType ?? 'other'] ?? KIND.other;
}
