/**
 * 日常業務の「探す」— 当たり方（画面を持たない部分・M9）
 *
 * **画面を立てずに素で試せるようにするため分けています。** 受付の打ち込みは
 * 揺れる（カタカナ／ひらがな、全角／半角、電話のハイフン）ので、
 * 当たり方そのものが要件です。
 *
 * 正規化は**内覧会と同じ1本**（`../inview/logic.ts` の `normalizeForSearch`）。
 * **写さないこと** — 写すと、片方だけ揺れを足したときに
 * 「内覧会では当たるのに探すでは当たらない」が起きます。
 */
import type { MiscInquiry } from '@/lib/types';
import type { SecurityCard } from '@/lib/securityCardApi';
import { normalizeForSearch } from '../inview/logic';

/** すべての語が、どれかの項目に含まれるか（空白区切りは AND） */
function matchesAll(fields: Array<unknown>, terms: string[]): boolean {
  const hay = fields.map(normalizeForSearch).filter(Boolean).join(' ');
  return terms.every((t) => hay.includes(t));
}

/**
 * セキュリティカード。**貸出先も探せる**のが要点 —
 * 「あの制作会社に何番を渡したか」が当日いちばん多い訊かれ方です。
 */
export function cardFields(c: SecurityCard): unknown[] {
  return [
    c.card_no, `no.${c.card_no}`, c.label, c.level_label,
    c.borrower_company, c.borrower_person, c.borrower_contact, c.purpose, c.notes,
  ];
}

export function matchesCard(c: SecurityCard, terms: string[]): boolean {
  return matchesAll(cardFields(c), terms);
}

/** 入ってきた情報。差出人・件名・要約・タグ */
export function matchesInquiry(q: MiscInquiry, terms: string[]): boolean {
  return matchesAll([q.sender, q.subject, q.summary, q.category, ...(q.tags ?? [])], terms);
}

/**
 * カードが「いま何になっているか」の1行。
 * **貸出中は誰に渡っているかを出す** — 番号だけ出しても受付では役に立ちません。
 */
export function cardSub(c: SecurityCard): string {
  if (c.status === 'lent') {
    const who = [c.borrower_company, c.borrower_person].filter(Boolean).join(' ');
    return [c.level_label, who ? `貸出中 ${who}` : '貸出中'].filter(Boolean).join(' ・ ');
  }
  return [c.level_label, c.is_active ? '貸せる' : '使えません'].filter(Boolean).join(' ・ ');
}
